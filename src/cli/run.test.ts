import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT_CODES } from './exit-codes.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('run', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
  });

  afterEach(() => repo.remove());

  describe('help', () => {
    it.each([['help'], ['--help'], ['-h']])('prints general help for %s', async (flag) => {
      const { code, out, err } = await otea(flag);

      expect(code).toBe(0);
      expect(err).toBe('');
      expect(out).toContain('Usage: otea <command> [options]');
      expect(out).toContain('otea init');
    });

    it('documents every exit code', async () => {
      const { out } = await otea('help');

      for (const [name, code] of Object.entries(EXIT_CODES)) {
        expect(out).toMatch(new RegExp(`^ +${code} +.*\\b${name}\\b`, 'm'));
      }
    });

    it('prints command usage for <command> --help', async () => {
      const { code, out } = await otea('init', '--help');

      expect(code).toBe(0);
      expect(out).toContain('Usage: otea init');
      expect(out).not.toContain('Exit codes');
    });
  });

  describe('usage errors', () => {
    it('fails with exit 2 and the general hint without a command', async () => {
      const { code, out, err } = await otea();

      expect(code).toBe(EXIT_CODES.usage);
      expect(out).toBe('');
      expect(err).toContain('Missing command');
      expect(err).toContain('otea help');
    });

    it('rejects an unknown command', async () => {
      const { code, err } = await otea('frobnicate');

      expect(code).toBe(2);
      expect(err).toContain('Unknown command "frobnicate"');
    });

    it('rejects an unknown option with the command usage', async () => {
      const { code, err } = await otea('init', '--bogus');

      expect(code).toBe(2);
      expect(err).toContain('--bogus');
      expect(err).toContain('Usage: otea init');
    });

    it('rejects unexpected positionals with the command usage', async () => {
      const { code, err } = await otea('init', 'extra');

      expect(code).toBe(2);
      expect(err).toContain('Usage: otea init');
    });

    it('prints errors as JSON on stderr with --json', async () => {
      const { code, out, err } = await otea('frobnicate', '--json');

      expect(code).toBe(2);
      expect(out).toBe('');
      expect(JSON.parse(err)).toEqual({
        error: { code: 'usage', message: 'Unknown command "frobnicate"' },
      });
    });
  });

  describe('init', () => {
    const oteaDir = () => join(repo.dir, '.otea');

    it('creates the project and prints the .otea path', async () => {
      const { code, out } = await otea('init');

      expect(code).toBe(0);
      expect(out.trim()).toBe(oteaDir());
      expect(existsSync(join(oteaDir(), 'otea.db'))).toBe(true);
    });

    it('is idempotent', async () => {
      await otea('init');

      expect(await otea('init')).toMatchObject({ code: 0, out: `${oteaDir()}\n` });
    });

    it('prints root and path with --json', async () => {
      const { out } = await otea('init', '--json');

      expect(JSON.parse(out)).toEqual({ root: repo.dir, path: oteaDir() });
    });
  });
});
