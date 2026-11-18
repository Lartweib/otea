import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listen } from '../server/listen.ts';
import { createServer } from '../server/server.ts';
import { memoryProject } from '../server/testing.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

// The first line; --no-open adds how to sign a browser in after it.
const URL_LINE = /^Otea running at (http:\/\/127\.0\.0\.1:(\d+))\/p\/([a-z0-9-]+)\/\n/;

const home = () => process.env.OTEA_HOME ?? '';

describe('open', () => {
  let repo: TempRepo;
  let interrupt: AbortController;
  let opened: string[];
  let otea: Cli;

  // One server per Otea home: its key and where it runs are in the home.
  const token = () => readFileSync(join(home(), 'ui-token'), 'utf8').trim();
  const serveFile = () => join(home(), 'serve.json');
  const serve = async (cwd = repo.dir) => {
    const { out } = await cliAt(cwd, {}, interrupt.signal)('serve', '--port', '0', '--no-open');
    const [, origin = '', port = '', id = ''] = URL_LINE.exec(out) ?? [];
    return { origin, port, id, page: `${origin}/p/${id}/` };
  };
  const signIn = (origin: string, next: string) =>
    `${origin}/auth?token=${token()}&next=${encodeURIComponent(next)}`;

  beforeEach(async () => {
    repo = tempGitRepo();
    interrupt = new AbortController();
    opened = [];
    otea = cliAt(repo.dir, {}, interrupt.signal, async (url) => {
      opened.push(url);
    });
    await otea('init', '--local');
  });

  afterEach(async () => {
    interrupt.abort();
    await vi.waitFor(() => repo.remove());
  });

  it("opens this project's page signed in to the running server without printing the token", async () => {
    const { origin, id, page } = await serve();

    const { code, out, err } = await otea('open');

    expect(code).toBe(0);
    expect(out).toBe(`Opened Otea at ${page}\n`);
    expect(opened).toEqual([signIn(origin, `/p/${id}/`)]);
    expect(out + err).not.toContain(token());
  });

  it('prints the url with --json', async () => {
    const { page } = await serve();

    expect(JSON.parse((await otea('open', '--json')).out)).toEqual({ url: page });
  });

  it('uses --port when serve.json is missing', async () => {
    const { origin, port, id } = await serve();
    rmSync(serveFile());

    const { code } = await otea('open', '--port', port);

    expect(code).toBe(0);
    expect(opened).toEqual([signIn(origin, `/p/${id}/`)]);
  });

  it('opens the home page of the server outside any project', async () => {
    const { origin } = await serve();
    const elsewhere = tempGitRepo();
    try {
      const outside = cliAt(elsewhere.dir, {}, interrupt.signal, async (url) => {
        opened.push(url);
      });
      const { code, out } = await outside('open');
      expect(code).toBe(0);
      expect(out).toBe(`Opened Otea at ${origin}/\n`);
      expect(opened).toEqual([signIn(origin, '/')]);
    } finally {
      elsewhere.remove();
    }
  });

  it('tells to run serve when the recorded server is gone', async () => {
    const { port } = await serve();
    interrupt.abort();
    await vi.waitFor(() =>
      expect(otea('open', '--port', port)).resolves.toMatchObject({ code: 11 }),
    );
    writeFileSync(serveFile(), JSON.stringify({ port: Number(port), pid: 1 }));

    const { code, err } = await otea('open');

    expect(code).toBe(11);
    expect(err).toContain(`No Otea server answers on port ${port}; run "otea serve"`);
    expect(err).not.toContain(token());
    expect(opened).toEqual([]);
  });

  it('refuses a server that belongs to another Otea home', async () => {
    await serve();
    const project = memoryProject();
    const other = await listen(
      createServer(project, { token: 'another-home-0123456789abcdefghijklmnopq' }),
      0,
    );
    try {
      const { code, err } = await otea('open', '--port', String(other.port));

      expect(code).toBe(11);
      expect(err).toContain(`The Otea server on port ${other.port} is another Otea home's`);
      expect(opened).toEqual([]);
    } finally {
      await other.close();
      project.db.close();
    }
  });

  it('fails when no browser can be opened', async () => {
    await serve();
    const failing = cliAt(repo.dir, {}, interrupt.signal, () => Promise.reject(new Error('nope')));

    const { code, err } = await failing('open');

    expect(code).toBe(1);
    expect(err).toContain('Could not open a browser (nope)');
  });

  it('is listed in the help', async () => {
    expect((await otea('help', 'all')).out).toContain('otea open [--port <port>]');
  });
});
