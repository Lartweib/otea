import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import {
  type Cli,
  cliAt,
  declareProfiles,
  presetCollection,
  tempGitRepo,
  until,
} from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));
const ARGS = ['--disable-warning=ExperimentalWarning', MAIN, 'mcp'];
// Runs the server under a parent of its own, as another harness process would start it.
const UNDER_ANOTHER_HARNESS = [
  '-e',
  "const c = require('node:child_process').spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit' }); c.on('exit', (code) => process.exit(code ?? 0)); process.stdin.on('end', () => c.kill());",
];

describe('mcp', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    declareProfiles(repo.dir, 'claude', 'claude-a', 'claude-b', 'codex', 'gemini', 'quill');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Docs', '--description', 'For v1');
  });

  afterEach(() => repo.remove());

  it('serves the agent tools over stdio as the agent named by --as', async () => {
    const client = new Client({ name: 'test', version: '0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...ARGS, '--as', 'claude'],
      cwd: repo.dir,
      // The transport passes only a safe default environment; the test home must reach the server.
      env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
      stderr: 'pipe',
    });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const claimed = await client.callTool({ name: 'claim', arguments: { id: 'TASKS-1' } });
    await client.close();

    expect(tools.map(({ name }) => name)).toContain('relay');
    expect(claimed.isError).toBeFalsy();
    expect(JSON.parse((claimed.content as { text: string }[])[0]?.text ?? '')).toMatchObject({
      lease: { holder: 'claude' },
    });
  });

  it('notes the agent as seen through its client as soon as it connects', async () => {
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...ARGS, '--as', 'claude'],
      cwd: repo.dir,
      env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
      stderr: 'pipe',
    });
    await client.connect(transport);
    const agents = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db);
      } finally {
        project.db.close();
      }
    };

    try {
      await until(() => agents().some(({ name }) => name === 'claude'));
    } finally {
      await client.close();
    }

    expect(agents().find(({ name }) => name === 'claude')).toMatchObject({
      harness: 'claude-code',
      live: true,
    });
  });

  it('refuses a second open session the name another session works under', async () => {
    const open = async (wrap: string[] = []) => {
      const client = new Client({ name: 'claude-code', version: '2.1.0' });
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [...wrap, ...ARGS, '--as', 'claude'],
          cwd: repo.dir,
          env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
          stderr: 'pipe',
        }),
      );
      return client;
    };
    const first = await open();
    const listening = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db).some(({ name, listening }) => name === 'claude' && listening);
      } finally {
        project.db.close();
      }
    };
    await until(listening);
    const second = await open(UNDER_ANOTHER_HARNESS);
    try {
      const mine = await first.callTool({ name: 'claim', arguments: { id: 'TASKS-1' } });
      expect(mine.isError).toBeFalsy();

      const refused = await second.callTool({ name: 'claim', arguments: { id: 'TASKS-1' } });
      expect(refused.isError).toBe(true);
      expect(JSON.parse((refused.content as { text: string }[])[0]?.text ?? '')).toMatchObject({
        error: { code: 'name_in_use' },
      });
      const renamed = await second.callTool({ name: 'list', arguments: { as: 'claude-b' } });
      expect(renamed.isError).toBeFalsy();
    } finally {
      await first.close();
      await second.close();
    }
  });

  it('gives the name to a new server its harness started, and refuses the old one from then on', async () => {
    const open = async () => {
      const client = new Client({ name: 'claude-code', version: '2.1.0' });
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [...ARGS, '--as', 'claude'],
          cwd: repo.dir,
          env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
          stderr: 'pipe',
        }),
      );
      return client;
    };
    const listeningFrom = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db).some(({ name, listening }) => name === 'claude' && listening);
      } finally {
        project.db.close();
      }
    };
    const old = await open();
    await until(listeningFrom);
    const restarted = await open();
    try {
      const mine = await restarted.callTool({ name: 'claim', arguments: { id: 'TASKS-1' } });
      expect(mine.isError).toBeFalsy();

      const refused = await old.callTool({ name: 'list', arguments: {} });
      expect(refused.isError).toBe(true);
      expect(JSON.parse((refused.content as { text: string }[])[0]?.text ?? '')).toMatchObject({
        error: { code: 'name_in_use' },
      });
    } finally {
      await old.close();
      await restarted.close();
    }
  });

  it('prints nothing but the protocol and exits once the client closes stdin', async () => {
    const child = spawn(process.execPath, ARGS, { cwd: repo.dir });
    let out = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    const exited = new Promise<number | null>((resolve) => child.on('close', resolve));
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '0' },
      },
    };
    child.stdin.write(`${JSON.stringify(initialize)}\n`);
    // A request still in flight when stdin ends is dropped, so close it once the reply is out.
    await until(() => out.endsWith('\n'));
    child.stdin.end();

    expect(await exited).toBe(0);
    expect(
      out
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).id),
    ).toEqual([1]);
  });
});
