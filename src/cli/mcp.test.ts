import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents, processAlive } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { selectProcessBeats } from '../store/queries.ts';
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

  // A harness that only loads the server (a background service) is no agent at work: none shows.
  it('notes the agent through its client from its first call, not as the client connects', async () => {
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...ARGS, '--as', 'quill'],
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
      await client.listTools();
      expect(agents().some(({ name, live }) => name === 'quill' && live)).toBe(false);

      await client.callTool({ name: 'list', arguments: {} });
      // Seen, and heard listening, while its session is open: closing it ends its listening.
      await until(() => agents().some(({ name, live }) => name === 'quill' && live));
      expect(agents().find(({ name }) => name === 'quill')).toMatchObject({
        harness: 'claude-code',
        live: true,
      });
    } finally {
      await client.close();
    }
  });

  // P1-R2-4, P2S-R2-3: a name the CLI refuses, or one whose first call failed, showed on the desk
  // as an agent «sin perfil».
  it('notes no agent for a call under an invalid name, nor for a first call that fails', async () => {
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ARGS,
        cwd: repo.dir,
        env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
        stderr: 'pipe',
      }),
    );
    const names = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db).map(({ name }) => name);
      } finally {
        project.db.close();
      }
    };
    try {
      const long = await client.callTool({ name: 'list', arguments: { as: 'x'.repeat(41) } });
      const failed = await client.callTool({
        name: 'show',
        arguments: { id: 'NOPE-1', as: 'probe' },
      });
      expect(long.isError).toBe(true);
      expect(failed.isError).toBe(true);
      expect(names()).not.toContain('x'.repeat(41));
      expect(names()).not.toContain('probe');

      const read = await client.callTool({ name: 'list', arguments: { as: 'probe' } });
      expect(read.isError).toBeFalsy();
      await until(() => names().includes('probe'));
    } finally {
      await client.close();
    }
  });

  // P4-R2-10: the harness loaded the server, the agent kept to the command line, and
  // connect --check stayed red until an explicit tool call.
  it('tells connect --check the server was loaded, before any tool call', async () => {
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ARGS,
        cwd: repo.dir,
        env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
        stderr: 'pipe',
      }),
    );
    try {
      // initialize, then initialized, then this: the server has noted the load by now.
      await client.listTools();
      const said = await otea('connect', '--check');

      expect(said.code).toBe(0);
      expect(said.out).toMatch(/^MCP works: claude-code loaded Otea's MCP server /);
    } finally {
      await client.close();
    }
  });

  // P3C-R3-12: the load was noted with the server's process id alone; once the session exited,
  // Windows gave that id to another process, and the desk kept «MCP sin usar».
  it('says it runs from its start, with no tool called, and that it ended once the client closes', async () => {
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ARGS,
      cwd: repo.dir,
      env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
      stderr: 'pipe',
    });
    await client.connect(transport);
    const beats = () => {
      const project = openProject(repo.dir);
      try {
        return selectProcessBeats(project.db);
      } finally {
        project.db.close();
      }
    };
    const server = transport.pid;
    await client.listTools();
    expect(server !== null && beats().has(server)).toBe(true);

    await client.close();
    await until(() => server === null || !processAlive(server), 10_000);
    expect(server !== null && beats().has(server)).toBe(false);
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
    await first.callTool({ name: 'list', arguments: {} });
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
    await old.callTool({ name: 'list', arguments: {} });
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

  it('stops counting its agent as listening once the client closes the session', async () => {
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...ARGS, '--as', 'claude'],
      cwd: repo.dir,
      env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
      stderr: 'pipe',
    });
    await client.connect(transport);
    await client.callTool({ name: 'list', arguments: {} });
    const listening = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db).some(({ name, listening }) => name === 'claude' && listening);
      } finally {
        project.db.close();
      }
    };
    await until(listening);
    const server = transport.pid;
    await client.close();
    // Within the server's own exit, not the listening window of minutes.
    await until(() => server === null || !processAlive(server), 10_000);
    expect(listening()).toBe(false);
  });

  // The server otea connect tells the agent to add: started from outside any project (a harness's
  // own config, kept for every folder), --project still serves it; from another project's folder
  // it refuses to write.
  it('serves the project --project names when started outside any project', async () => {
    // A project in common storage, the default: the registry finds it by its id.
    const shop = tempGitRepo();
    const there = cliAt(shop.dir, { OTEA_AGENT: 'claude' });
    await there('init', '--template', 'changes');
    await there('create', '--collection', 'Cambios', '--title', 'Docs', '--field', 'Qué quiero=x');
    const id = JSON.parse((await there('projects', 'current', '--json')).out).id;
    const outside = tempGitRepo();
    const client = new Client({ name: 'opencode', version: '1.4.0' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [...ARGS, '--project', id],
          cwd: outside.dir,
          env: { ...getDefaultEnvironment(), OTEA_HOME: process.env.OTEA_HOME ?? '' },
          stderr: 'pipe',
        }),
      );
      const listed = await client.callTool({ name: 'list', arguments: { as: 'codex' } });

      expect((listed.content as { text: string }[])[0]?.text).toContain('Docs');
      expect(listed.isError).toBeFalsy();
    } finally {
      await client.close();
      outside.remove();
      shop.remove();
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
