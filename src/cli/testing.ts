import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run.ts';

export type Result = { code: number; out: string; err: string };

export type Cli = (...argv: string[]) => Promise<Result>;

export function cliAt(
  cwd: string,
  env: Record<string, string> = {},
  signal = new AbortController().signal,
): Cli {
  return async (...argv) => {
    let out = '';
    let err = '';
    const code = await run(argv, {
      cwd,
      env,
      signal,
      stdout: { write: (chunk: string) => (out += chunk) },
      stderr: { write: (chunk: string) => (err += chunk) },
    });
    return { code, out, err };
  };
}

export function tempGitRepo(): { dir: string; remove: () => void } {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-cli-')));
  execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
