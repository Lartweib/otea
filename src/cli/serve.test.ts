import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
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
  let opened: string[];

  const token = () => readFileSync(join(repo.dir, '.otea', 'ui-token'), 'utf8').trim();
  const serveFile = () => join(repo.dir, '.otea', 'serve.json');

  beforeEach(async () => {
    repo = tempGitRepo();
    interrupt = new AbortController();
    opened = [];
    otea = cliAt(repo.dir, {}, interrupt.signal, async (url) => {
      opened.push(url);
    });
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

  it('opens the browser at a sign-in url without printing the token', async () => {
    const { out, err } = await otea('serve', '--port', '0');
    const url = URL_LINE.exec(out)?.[1];

    expect(opened).toEqual([`${url}/auth?token=${token()}`]);
    expect(out + err).not.toContain(token());
    const signIn = await fetch(opened[0] ?? '', { redirect: 'manual' });
    expect(signIn.status).toBe(302);
  });

  it('does not open the browser with --no-open', async () => {
    const { code } = await otea('serve', '--port', '0', '--no-open');

    expect(code).toBe(0);
    expect(opened).toEqual([]);
  });

  it('keeps serving with a one-line note when no browser can be opened', async () => {
    const failing = cliAt(repo.dir, {}, interrupt.signal, () => Promise.reject(new Error('nope')));

    const { code, out, err } = await failing('serve', '--port', '0');
    const url = URL_LINE.exec(out)?.[1];

    expect(code).toBe(0);
    expect(err).toBe('otea: Could not open a browser (nope); run "otea open" to try again\n');
    expect((await fetch(`${url}/api/items`)).status).toBe(200);
  });

  it('reuses the token across restarts', async () => {
    await otea('serve', '--port', '0');
    const first = token();
    interrupt.abort();
    const again = new AbortController();

    await cliAt(repo.dir, {}, again.signal)('serve', '--port', '0');

    expect(token()).toBe(first);
    again.abort();
  });

  it('records its port in serve.json while running and removes it on shutdown', async () => {
    const { out } = await otea('serve', '--port', '0');
    const port = Number(new URL(URL_LINE.exec(out)?.[1] ?? '').port);

    expect(JSON.parse(readFileSync(serveFile(), 'utf8'))).toEqual({ port, pid: process.pid });

    interrupt.abort();
    await vi.waitFor(() => expect(existsSync(serveFile())).toBe(false));
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
    expect((await otea('help')).out).toContain('otea serve [--port <port>] [--no-open]');
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
