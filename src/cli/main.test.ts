import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../../bin/otea.mjs', import.meta.url));

describe('main', () => {
  // The command npm link puts on the PATH: Node with no flags, so Node's notices stay quiet.
  // Its first run fills Node's compile cache, which takes a while on a slow Windows runner.
  it('runs as the otea command npm installs, with no warning on stderr', {
    timeout: 90_000,
  }, () => {
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
