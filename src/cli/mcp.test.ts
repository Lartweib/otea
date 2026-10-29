import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo, until } from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));
const ARGS = ['--disable-warning=ExperimentalWarning', MAIN, 'mcp'];

describe('mcp', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
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
