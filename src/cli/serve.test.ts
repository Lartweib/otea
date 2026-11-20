import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Cli, cliAt, presetCollection, removeOnceReleased, tempGitRepo } from './testing.ts';

// `Otea running at <origin>/p/<project id>/`: every project has its page on the one server.
const URL_LINE = /^Otea running at (http:\/\/127\.0\.0\.1:\d+)\/p\/([a-z0-9-]+)\/\n$/;

const home = () => process.env.OTEA_HOME ?? '';

function occupyPort(): Promise<{ port: number; server: Server }> {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ port: typeof address === 'object' && address ? address.port : 0, server });
    });
  });
}

const signInFor = (origin: string, token: string, id: string) =>
  `${origin}/auth?token=${token}&next=${encodeURIComponent(`/p/${id}/`)}`;

describe('serve', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let interrupt: AbortController;
  let otea: Cli;
  let opened: string[];

  // One server per Otea home: its key and where it runs are kept in the home, not the project.
  const token = () => readFileSync(join(home(), 'ui-token'), 'utf8').trim();
  const serveFile = () => join(home(), 'serve.json');

  beforeEach(async () => {
    repo = tempGitRepo();
    interrupt = new AbortController();
    opened = [];
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' }, interrupt.signal, async (url) => {
      opened.push(url);
    });
    await otea('init', '--local');
  });

  afterEach(async () => {
    interrupt.abort();
    await removeOnceReleased(repo.dir);
  });

  it('serves the project on 127.0.0.1, under its own path, until interrupted', async () => {
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'First');

    const { code, out } = await otea('serve', '--port', '0');
    const [, origin, id] = URL_LINE.exec(out) ?? [];

    expect(code).toBe(0);
    expect(origin).toBeDefined();
    const items = await (await fetch(`${origin}/p/${id}/api/items`)).json();
    expect(items).toMatchObject([{ id: 'TASKS-1', title: 'First' }]);

    interrupt.abort();
    await vi.waitFor(() => expect(fetch(`${origin}/p/${id}/api/items`)).rejects.toThrow());
  });

  it('opens the browser at a sign-in url for this project without printing the token', async () => {
    const { out, err } = await otea('serve', '--port', '0');
    const [, origin = '', id = ''] = URL_LINE.exec(out) ?? [];

    expect(opened).toEqual([signInFor(origin, token(), id)]);
    expect(out + err).not.toContain(token());
    const signIn = await fetch(opened[0] ?? '', { redirect: 'manual' });
    expect(signIn.status).toBe(302);
    expect(signIn.headers.get('location')).toBe(`/p/${id}/`);
  });

  it('points a second otea serve at the one running, from another project', async () => {
    const { out } = await otea('serve', '--port', '0', '--json');
    const { origin } = new URL((JSON.parse(out) as { url: string }).url);
    const other = tempGitRepo();
    try {
      const there = cliAt(other.dir, { OTEA_AGENT: 'claude' }, interrupt.signal);
      await there('init', '--local');
      const second = await there('serve', '--port', '0', '--no-open', '--json');
      const data = JSON.parse(second.out) as { url: string; attached?: boolean };
      expect(data.attached).toBe(true);
      const page = new URL(data.url);
      expect(page.origin).toBe(origin);
      // The running server serves the second project too, which it had never seen.
      const project = await fetch(`${data.url}api/project`);
      expect(project.status).toBe(200);
      expect(page.pathname).toBe(`/p/${((await project.json()) as { id: string }).id}/`);
    } finally {
      // The server holds the second project open until it stops.
      interrupt.abort();
      await removeOnceReleased(other.dir);
    }
  });

  it('does not open the browser with --no-open', async () => {
    const { code } = await otea('serve', '--port', '0', '--no-open');

    expect(code).toBe(0);
    expect(opened).toEqual([]);
  });

  it('prints the sign-in url with --no-open at a terminal, where only the person reads it', async () => {
    const terminal = cliAt(repo.dir, {}, interrupt.signal, undefined, undefined, undefined, true);

    const { out } = await terminal('serve', '--port', '0', '--no-open');
    const [, origin = '', id = ''] = /^Otea running at (\S+)\/p\/([a-z0-9-]+)\/\n/.exec(out) ?? [];

    expect(out).toBe(
      `Otea running at ${origin}/p/${id}/\nSign a browser in at ${signInFor(origin, token(), id)} (it holds this computer's Otea key: keep it to yourself)\n`,
    );
    const signIn = await fetch(signInFor(origin, token(), id), { redirect: 'manual' });
    expect(signIn.status).toBe(302);
  });

  it('prints the sign-in url without a terminal too, for an agent to relay, but never in --json', async () => {
    const { out } = await otea('serve', '--port', '0', '--no-open');
    const [, origin = '', id = ''] = /^Otea running at (\S+)\/p\/([a-z0-9-]+)\/\n/.exec(out) ?? [];

    expect(out).toBe(
      `Otea running at ${origin}/p/${id}/\nSign a browser in at ${signInFor(origin, token(), id)} (it holds this computer's Otea key: keep it to yourself)\n`,
    );
    interrupt.abort();
    interrupt = new AbortController();
    const terminal = cliAt(repo.dir, {}, interrupt.signal, undefined, undefined, undefined, true);
    const json = await terminal('serve', '--port', '0', '--no-open', '--json');
    expect(json.out).not.toContain(token());
  });

  it('keeps serving with a one-line note when no browser can be opened', async () => {
    const failing = cliAt(repo.dir, {}, interrupt.signal, () => Promise.reject(new Error('nope')));

    const { code, out, err } = await failing('serve', '--port', '0');
    const [, origin, id] = URL_LINE.exec(out) ?? [];

    expect(code).toBe(0);
    expect(err).toBe('otea: Could not open a browser (nope); run "otea open" to try again\n');
    expect((await fetch(`${origin}/p/${id}/api/items`)).status).toBe(200);
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

  it('records its port in the home serve.json while running and removes it on shutdown', async () => {
    const { out } = await otea('serve', '--port', '0');
    const port = Number(new URL(URL_LINE.exec(out)?.[1] ?? '').port);

    expect(JSON.parse(readFileSync(serveFile(), 'utf8'))).toEqual({ port, pid: process.pid });
    expect(existsSync(join(repo.dir, '.otea', 'serve.json'))).toBe(false);

    interrupt.abort();
    await vi.waitFor(() => expect(existsSync(serveFile())).toBe(false));
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
});

describe('serve outside any project', () => {
  it('serves every project of the home, opening at its home page', async () => {
    const repo = tempGitRepo();
    const interrupt = new AbortController();
    try {
      const { code, out } = await cliAt(repo.dir, {}, interrupt.signal)(
        'serve',
        '--port',
        '0',
        '--no-open',
        '--json',
      );
      expect(code).toBe(0);
      const { url } = JSON.parse(out) as { url: string };
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      interrupt.abort();
      // Stopped: it no longer answers, and it let go of the home's files.
      await vi.waitFor(() => expect(fetch(url)).rejects.toThrow());
    } finally {
      interrupt.abort();
      await removeOnceReleased(repo.dir);
    }
  });
});
