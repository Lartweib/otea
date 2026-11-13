import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
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
    const dataDir = (id: string) => join(process.env.OTEA_HOME ?? '', 'data', id);

    it('creates the project in the Otea home and prints its data folder', async () => {
      const { code, out } = await otea('init', '--json');

      const { id, path } = JSON.parse(out);
      expect(code).toBe(0);
      expect(path).toBe(dataDir(id));
      expect(existsSync(join(path, 'otea.db'))).toBe(true);
      expect(existsSync(oteaDir())).toBe(false);
    });

    it('keeps the project in .otea at the root with --local', async () => {
      const { code, out } = await otea('init', '--local');

      expect(code).toBe(0);
      expect(out).toBe(`${oteaDir()}\nMade the boards Tareas, Errores\n`);
      expect(existsSync(join(oteaDir(), 'otea.db'))).toBe(true);
    });

    it('is idempotent, making its first boards once', async () => {
      const first = await otea('init');
      const [path] = first.out.split('\n');

      expect(first.out).toBe(`${path}\nMade the boards Tareas, Errores\n`);
      expect(await otea('init')).toMatchObject({ code: 0, out: `${path}\n` });
      expect(await otea('init', '--local')).toMatchObject({ code: 0, out: `${path}\n` });
    });

    it('makes no board from --template on a project that has boards, and says how to add one', async () => {
      await otea('init', '--local');

      expect(await otea('init', '--local', '--template', 'product')).toMatchObject({
        code: 0,
        out: `${oteaDir()}\nThe project already has boards; add one with otea board add <name> --template product\n`,
      });
      expect((await otea('init', '--local', '--template', 'nope')).code).toBe(3);
    });

    it('says in its help that none leaves only the built-in Pedidos, and lists the templates', async () => {
      const { out } = await otea('init', '--help');

      expect(out).toContain('none makes no board but Pedidos');
      expect(out).toContain('repos, product');
    });

    it('makes the boards of a template set with --template', async () => {
      const { code, out } = await otea('init', '--local', '--template', 'repos');

      expect(code).toBe(0);
      expect(out).toBe(`${oteaDir()}\nMade the boards Cambios, Tareas de repo\n`);
    });

    it('prints root, path, storage and the project identity with --json', async () => {
      const { out } = await otea('init', '--json');

      const id = expect.stringMatching(/^otea-cli-[a-z0-9-]+-[a-z2-7]{6}$/);
      expect(JSON.parse(out)).toEqual({
        root: repo.dir,
        path: expect.any(String),
        id,
        name: basename(repo.dir),
        icon: null,
        storage: 'common',
        boards: [
          { id: expect.any(String), name: 'Tareas' },
          { id: expect.any(String), name: 'Errores' },
        ],
      });
    });

    it('keeps the identity when init runs again', async () => {
      const { boards: _made, ...first } = JSON.parse((await otea('init', '--json')).out);

      expect(JSON.parse((await otea('init', '--json')).out)).toEqual({ ...first, boards: [] });
    });
  });
});
