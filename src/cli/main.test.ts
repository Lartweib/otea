import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

function otea(...argv: string[]) {
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN, ...argv], {
    encoding: 'utf8',
  });
}

describe('main', () => {
  it('runs the CLI as a process', () => {
    const { status, stdout, stderr } = otea('help');

    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Usage: otea <command> [options]');
  });

  it('sets the process exit code', () => {
    expect(otea('frobnicate').status).toBe(2);
  });
});
