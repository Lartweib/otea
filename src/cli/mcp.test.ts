import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { type Cli, cliAt, tempGitRepo, until } from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));
const ARGS = ['--disable-warning=ExperimentalWarning', MAIN, 'mcp'];

describe('mcp', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init', '--local');
    await otea('collection', 'add', 'tasks');
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
