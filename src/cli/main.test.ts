import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));
const BIN = fileURLToPath(new URL('../../bin/otea.mjs', import.meta.url));

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

  // The command npm link puts on the PATH: Node with no flags, so Node's notices stay quiet.
  it('runs as the otea command npm installs, with no warning on stderr', () => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [BIN, 'help'], {
      encoding: 'utf8',
    });

    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Usage: otea <command> [options]');
  });

  it('is the bin package.json names', () => {
    const { bin } = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );

    expect(bin).toEqual({ otea: 'bin/otea.mjs' });
    expect(readFileSync(BIN, 'utf8')).toMatch(/^#!\/usr\/bin\/env node\n/);
  });
});
