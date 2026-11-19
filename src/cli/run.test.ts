import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INIT_NEXT } from './commands.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// What init says to do next, after what it did.
const NEXT = `${INIT_NEXT.join('\n')}\n`;

// P4-R3-9: after init's «Next: otea serve…» an agent ran the desk in its own shell, and the desk
// died with the agent's session.
describe("init's next step", () => {
  it('leaves the desk to the person, in a terminal of their own or the desktop app', () => {
    expect(INIT_NEXT).toEqual([
      "Next: run otea serve in a terminal of your own, or open the Otea desktop app: the desk gives you the text to paste into your agent's chat (otea prompt prints it here).",
      'An agent setting itself up runs otea connect --as <name> --model <id> --effort <level>; it never starts the desk for the person (if it must, otea serve --no-open).',
    ]);
  });
});

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
      expect(out).toContain('otea next');
    });

    it('is short: the agent commands in a line each, the others by name, and where the rest is', async () => {
      const { code, out } = await otea('help');

      expect(code).toBe(0);
      expect(out.length).toBeLessThan(6000);
      expect(out).toMatch(/^ {2}next {2,}\S/m);
      expect(out).toMatch(/^ {2}handoff <id> {2,}\S/m);
      expect(out).toContain('init, ');
      expect(out).toContain('otea help all');
      expect(out).toContain('otea board');
      expect(out).not.toContain('Exit codes:');
    });

    it('prints a command help for help <command>', async () => {
      const { code, out } = await otea('help', 'projects', 'add');

      expect(code).toBe(0);
      expect(out).toContain('Usage: otea projects add');
    });

    it('documents every exit code', async () => {
      const { out } = await otea('help', 'all');

      for (const [name, code] of Object.entries(EXIT_CODES)) {
        expect(out).toMatch(new RegExp(`^ +${code} +.*\\b${name}\\b`, 'm'));
      }
    });

    it.each([['--version'], ['-v']])('prints the version for %s', async (flag) => {
      const { version } = JSON.parse(
        readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
      );
      const { code, out, err } = await otea(flag);

      expect(code).toBe(0);
      expect(err).toBe('');
      expect(out).toBe(`${version}
`);
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

    it('names the commands of a group it was given alone or with a word it does not take', async () => {
      const bare = await otea('projects');
      expect(bare.code).toBe(2);
      expect(bare.err).toContain(
        '"projects" needs a command: list, current, add, relink, forget (otea projects <command> --help)',
      );

      const rename = await otea('projects', 'rename', 'x');
      expect(rename.code).toBe(2);
      expect(rename.err).toContain(
        'Unknown command "projects rename": otea projects takes list, current, add, relink, forget',
      );

      const repos = await otea('repos', 'rename', 'api', 'web');
      expect(repos.err).toContain('to rename a repo, otea repos add <path> --name <name>');
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
      expect(out).toBe(`Project data in ${oteaDir()}\n${NEXT}`);
      expect(existsSync(join(oteaDir(), 'otea.db'))).toBe(true);
    });

    it('is idempotent, making its first boards once', async () => {
      const first = await otea('init', '--template', 'changes');
      const [path] = first.out.split('\n');

      expect(path).toMatch(/^Project data in /);
      expect(first.out).toBe(`${path}\nMade the boards Cambios\n${NEXT}`);
      expect(await otea('init')).toMatchObject({ code: 0, out: `${path}\n${NEXT}` });
      expect(await otea('init', '--local')).toMatchObject({ code: 0, out: `${path}\n${NEXT}` });
    });

    it('makes no board from --template on a project that has boards, and says how to add one', async () => {
      await otea('init', '--local', '--template', 'changes');

      expect(await otea('init', '--local', '--template', 'ideas')).toMatchObject({
        code: 0,
        out: `Project data in ${oteaDir()}\nThe project already has boards; add one with otea board add <name> --template ideas\n${NEXT}`,
      });
      expect((await otea('init', '--local', '--template', 'nope')).code).toBe(3);
    });

    it('says in its help that it makes no board unless --template names one, and lists the templates', async () => {
      const { out } = await otea('init', '--help');

      expect(out).toContain('it makes no board unless --template <key> names one');
      expect(out).toContain('bug-reports, changes');
      expect(out).toContain('ideas, repos');
      // Each key with what it is for.
      expect(out).toMatch(/^ {2}bug-reports {2,}Bugs, whether you find them/m);
      expect(out).toMatch(/^ {2}repos {2,}Deliveries with PRs \(a set\): Each Job/m);
    });

    it('makes the boards of a template set with --template', async () => {
      const { code, out } = await otea('init', '--local', '--template', 'repos');

      expect(code).toBe(0);
      expect(out).toBe(`Project data in ${oteaDir()}\nMade the boards Trabajos, Entregas\n${NEXT}`);
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
        boards: [],
      });
    });

    it('keeps the identity when init runs again', async () => {
      const { boards: _made, ...first } = JSON.parse((await otea('init', '--json')).out);

      expect(JSON.parse((await otea('init', '--json')).out)).toEqual({ ...first, boards: [] });
    });
  });
});
