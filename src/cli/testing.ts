import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Opener } from './opener.ts';
import { run } from './run.ts';

export type Result = { code: number; out: string; err: string };

export type Cli = (...argv: string[]) => Promise<Result>;

export function cliAt(
  cwd: string,
  env: Record<string, string> = {},
  signal = new AbortController().signal,
  openUrl: Opener = async () => {},
  ask?: (question: string) => Promise<string>,
): Cli {
  return async (...argv) => {
    let out = '';
    let err = '';
    const code = await run(argv, {
      cwd,
      env,
      signal,
      openUrl,
      ...(ask ? { ask } : {}),
      stdout: { write: (chunk: string) => (out += chunk) },
      stderr: { write: (chunk: string) => (err += chunk) },
    });
    return { code, out, err };
  };
}

export type Running = {
  out: () => string;
  err: () => string;
  done: Promise<number>;
  // Interrupts the command, as Ctrl+C does, and resolves with its exit code.
  stop: () => Promise<number>;
};

// Starts a long-running command (wait, events --follow) and lets the test read its output so far.
export function startCli(cwd: string, ...argv: string[]): Running {
  const interrupt = new AbortController();
  let out = '';
  let err = '';
  const done = run(argv, {
    cwd,
    env: {},
    signal: interrupt.signal,
    openUrl: async () => {},
    stdout: { write: (chunk: string) => (out += chunk) },
    stderr: { write: (chunk: string) => (err += chunk) },
  });
  const stop = () => {
    interrupt.abort();
    return done;
  };
  return { out: () => out, err: () => err, done, stop };
}

// Resolves once `ready` holds, polling, or rejects after `timeoutMs`.
export async function until(ready: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

// Runs the CLI as a separate process, for tests that need real concurrent writers.
export function spawnCli(cwd: string, ...argv: string[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    const args = ['--disable-warning=ExperimentalWarning', MAIN, ...argv];
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, OTEA_AGENT: '' } });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

export type TempRepo = {
  dir: string;
  write: (path: string, content: string) => void;
  remove: () => void;
};

export function tempGitRepo(): TempRepo {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-cli-')));
  execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return {
    dir,
    write: (path, content) => {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
