import { createServer, type Server } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const URL_LINE = /^Otea running at (http:\/\/127\.0\.0\.1:\d+)\n$/;

function occupyPort(): Promise<{ port: number; server: Server }> {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ port: typeof address === 'object' && address ? address.port : 0, server });
    });
  });
}

describe('serve', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let interrupt: AbortController;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    interrupt = new AbortController();
    otea = cliAt(repo.dir, {}, interrupt.signal);
    await otea('init');
  });

  afterEach(async () => {
    interrupt.abort();
    await vi.waitFor(() => repo.remove());
  });

  it('serves the project on 127.0.0.1 until interrupted', async () => {
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'First');

    const { code, out } = await otea('serve', '--port', '0');
    const url = URL_LINE.exec(out)?.[1];

    expect(code).toBe(0);
    expect(url).toBeDefined();
    const items = await (await fetch(`${url}/api/items`)).json();
    expect(items).toMatchObject([{ id: 'TASKS-1', title: 'First' }]);

    interrupt.abort();
    await vi.waitFor(() => expect(fetch(`${url}/api/items`)).rejects.toThrow());
  });

  it('prints the url with --json', async () => {
    const { out } = await otea('serve', '--port', '0', '--json');

    expect(JSON.parse(out).url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('fails with a clear error when the port is busy', async () => {
    const busy = await occupyPort();

    const { code, err } = await otea('serve', '--port', String(busy.port));

    busy.server.close();
    expect(code).toBe(1);
    expect(err).toContain(`Port ${busy.port} is already in use`);
  });

  it.each(['abc', '65536', '1.5', ''])('rejects --port %s', async (port) => {
    const { code, err } = await otea('serve', '--port', port);

    expect(code).toBe(2);
    expect(err).toContain('--port must be an integer between 0 and 65535');
  });

  it('is listed in the help', async () => {
    expect((await otea('help')).out).toContain('otea serve [--port <port>]');
  });
});

describe('serve without a project', () => {
  it('fails with not_found', async () => {
    const repo = tempGitRepo();

    const { code, err } = await cliAt(repo.dir)('serve', '--port', '0');

    repo.remove();
    expect(code).toBe(3);
    expect(err).toContain('run init first');
  });
});
