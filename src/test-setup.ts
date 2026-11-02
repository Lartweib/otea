import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, vi } from 'vitest';

// No test may touch the user's real ~/.otea. Each test file gets its own OTEA_HOME, which processes
// it spawns inherit, and the home folder is off limits: code that falls back to it throws.
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => {
    throw new Error('Tests must not use the home folder; pass OTEA_HOME (a temp dir) in the env');
  };
  return { ...os, homedir, default: { ...os, homedir } };
});

const home = mkdtempSync(join(tmpdir(), 'otea-home-'));
process.env.OTEA_HOME = home;
afterAll(() => rmSync(home, { recursive: true, force: true }));
