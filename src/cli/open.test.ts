import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

const URL_LINE = /^Otea running at (http:\/\/127\.0\.0\.1:(\d+))\n$/;

describe('open', () => {
  let repo: TempRepo;
  let interrupt: AbortController;
  let opened: string[];
  let otea: Cli;

  const token = () => readFileSync(join(repo.dir, '.otea', 'ui-token'), 'utf8').trim();
  const serveFile = () => join(repo.dir, '.otea', 'serve.json');
  const serve = async (cwd = repo.dir) => {
    const { out } = await cliAt(cwd, {}, interrupt.signal)('serve', '--port', '0', '--no-open');
    const [, url = '', port = ''] = URL_LINE.exec(out) ?? [];
    return { url, port };
  };

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

  it('opens the browser signed in to the running server without printing the token', async () => {
    const { url } = await serve();

    const { code, out, err } = await otea('open');

    expect(code).toBe(0);
    expect(out).toBe(`Opened Otea at ${url}\n`);
    expect(opened).toEqual([`${url}/auth?token=${token()}`]);
    expect(out + err).not.toContain(token());
  });

  it('prints the url with --json', async () => {
    const { url } = await serve();

    expect(JSON.parse((await otea('open', '--json')).out)).toEqual({ url });
  });

  it('uses --port when serve.json is missing', async () => {
    const { url, port } = await serve();
    rmSync(serveFile());

    const { code } = await otea('open', '--port', port);

    expect(code).toBe(0);
    expect(opened).toEqual([`${url}/auth?token=${token()}`]);
  });

  it('tells to run serve when nothing has been served yet', async () => {
    const { code, err } = await otea('open');

    expect(code).toBe(11);
    expect(err).toContain('run "otea serve"');
    expect(opened).toEqual([]);
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

  it('refuses a server that belongs to another project', async () => {
    const other = tempGitRepo();
    await cliAt(other.dir)('init');
    const { port } = await serve(other.dir);
    await serve();

    const { code, err } = await otea('open', '--port', port);

    expect(code).toBe(11);
    expect(err).toContain(`The Otea server on port ${port} serves another project`);
    expect(opened).toEqual([]);
    interrupt.abort();
    await vi.waitFor(() => other.remove());
  });

  it('fails when no browser can be opened', async () => {
    await serve();
    const failing = cliAt(repo.dir, {}, interrupt.signal, () => Promise.reject(new Error('nope')));

    const { code, err } = await failing('open');

    expect(code).toBe(1);
    expect(err).toContain('Could not open a browser (nope)');
  });

  it('is listed in the help', async () => {
    expect((await otea('help')).out).toContain('otea open [--port <port>]');
  });
});

describe('open without a project', () => {
  it('fails with not_found', async () => {
    const repo = tempGitRepo();

    const { code, err } = await cliAt(repo.dir)('open');

    repo.remove();
    expect(code).toBe(3);
    expect(err).toContain('run init first');
  });
});
