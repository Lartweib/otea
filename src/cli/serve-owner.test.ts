import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processAlive } from '../app/presence.ts';
import { cliAt, type TempRepo, tempGitRepo, until } from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

// Starts otea serve from a process that ends once it serves, as the shell that ran PowerShell's
// Start-Process or an agent's background shell does, with its output in files (the serve log);
// resolves with the server's process id. The starter waits for the server to say it runs: one that
// ended before the server read who started it would leave it adopted by init on Linux and macOS,
// with no starter to watch.
async function startedByAProcessThatEnds(
  cwd: string,
  home: string,
  logs: string,
  extra: readonly string[] = [],
): Promise<number> {
  const out = join(logs, 'serve.out');
  const err = join(logs, 'serve.err');
  const starter = [
    "const { spawn } = require('node:child_process');",
    "const { openSync, readFileSync } = require('node:fs');",
    `const child = spawn(process.execPath, ${JSON.stringify(['--disable-warning=ExperimentalWarning', MAIN, 'serve', '--no-open', '--port', '0', ...extra])}, {`,
    `  cwd: ${JSON.stringify(cwd)},`,
    `  env: { ...process.env, OTEA_HOME: ${JSON.stringify(home)} },`,
    `  stdio: ['ignore', openSync(${JSON.stringify(out)}, 'w'), openSync(${JSON.stringify(err)}, 'w')],`,
    // Detached, as Start-Process starts it: on Windows a child that is not dies with its parent.
    '  windowsHide: true,',
    '  detached: true,',
    '});',
    'child.unref();',
    'console.log(child.pid);',
    'const serving = () => {',
    `  try { if (readFileSync(${JSON.stringify(out)}, 'utf8').includes('Otea running at')) process.exit(0); } catch {}`,
    '  setTimeout(serving, 50);',
    '};',
    'serving();',
    'setTimeout(() => process.exit(1), 30_000);',
  ].join('\n');
  const parent = spawn(process.execPath, ['-e', starter], { stdio: ['ignore', 'pipe', 'inherit'] });
  let printed = '';
  parent.stdout.on('data', (chunk) => (printed += String(chunk)));
  await new Promise((resolve) => parent.on('exit', resolve));
  const pid = Number(printed.trim());
  await until(() => readFileSync(out, 'utf8').includes('Otea running at'), 20_000).catch(() => {
    throw new Error(
      `serve did not start: ${readFileSync(out, 'utf8')} ${readFileSync(err, 'utf8')} (${printed})`,
    );
  });
  return pid;
}

// P1-R3-5: otea serve started in the background (PowerShell Start-Process with redirects) died
// 19 to 70 seconds later with an empty stderr: it stops once the process that started it ends, as
// it should for an agent's session, but said nothing. It says why now, and --no-owner keeps it.
describe('serve started by a process that ends', () => {
  let repo: TempRepo;
  let home: string;
  let logs: string;
  let pid: number | undefined;

  beforeEach(async () => {
    repo = tempGitRepo();
    home = mkdtempSync(join(tmpdir(), 'otea-serve-home-'));
    logs = mkdtempSync(join(tmpdir(), 'otea-serve-logs-'));
    await cliAt(repo.dir, { OTEA_HOME: home })('init', '--local');
  });

  afterEach(async () => {
    const started = pid;
    pid = undefined;
    if (started !== undefined && processAlive(started)) process.kill(started);
    if (started !== undefined) await until(() => !processAlive(started), 10_000);
    // Windows lets go of the folder a process ran in a moment after it ends.
    await vi.waitFor(() => {
      repo.remove();
      rmSync(home, { recursive: true, force: true });
      rmSync(logs, { recursive: true, force: true });
    });
  });

  it('stops, saying why on stderr and how to keep it running', async () => {
    pid = await startedByAProcessThatEnds(repo.dir, home, logs);

    await until(() => !processAlive(pid ?? 0), 30_000);
    const said = readFileSync(join(logs, 'serve.err'), 'utf8');
    expect(said).toMatch(/^otea: serve stopped: the process that started it \(\d+\) ended/);
    expect(said).toContain(
      'ended, as when the terminal or the agent session that ran it closes. To keep it running on its own, start it with otea serve --no-owner, and stop it with Ctrl+C or by its process id.',
    );
  }, 40_000);

  it('keeps running with --no-owner', async () => {
    pid = await startedByAProcessThatEnds(repo.dir, home, logs, ['--no-owner']);

    // Past two of the checks that stop it otherwise (every 5 s).
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    expect(processAlive(pid)).toBe(true);
    expect(readFileSync(join(logs, 'serve.err'), 'utf8')).not.toContain('stopped');
  }, 40_000);
});
