import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBoardRecord, listBoardSummaries, publishBoard, saveDraft } from '../app/boards.ts';
import { moveItem } from '../app/items.ts';
import { openProject } from '../app/project.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { installGitHook } from './hooks.ts';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

describe('check', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let name: string;
  let task: string;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  // The person's own moves: approving the proposal, then the work.
  const person = (id: string, to: string) => {
    const project = openProject(repo.dir);
    try {
      moveItem(project, {
        id,
        to,
        actor: { kind: 'human', name: 'ana' },
        channel: 'ui',
      });
    } finally {
      project.db.close();
    }
  };

  const ORIGIN = 'https://github.com/acme/keys.git';

  beforeEach(async () => {
    repo = tempGitRepo();
    execFileSync('git', ['checkout', '--quiet', '-b', 'chg-1/keys'], { cwd: repo.dir });
    execFileSync('git', ['remote', 'add', 'origin', ORIGIN], { cwd: repo.dir });
    name = basename(repo.dir);
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    presetCollection(repo.dir, 'changes', 'change');
    await otea('create', '--collection', 'changes', '--title', 'Keys');
    task = (
      await json(
        'create',
        '--collection',
        'Tareas de repo',
        '--parent',
        'CHANGES-1',
        '--title',
        'Keys here',
        '--field',
        `repo=${name}`,
        '--field',
        'branch=chg-1/keys',
      )
    ).id;
  });

  afterEach(() => repo.remove());

  it('refuses a push before the proposal is approved, in the board’s words', async () => {
    expect(await otea('check', '--gate', 'push', '--branch', '--repo')).toEqual({
      code: 19,
      out: `push refused: ${task} is in Propuesta; its branch can be pushed only while Implementar is being done.\n`,
      err: '',
    });
  });

  it('allows a push while implementing and refuses it in review; merges only once Done', async () => {
    person(task, 'implementing');

    expect(await otea('check', '--gate', 'push', '--branch', '--repo')).toMatchObject({
      code: 0,
      out: `push allowed: ${task} is being done in Implementar.\n`,
    });
    expect((await otea('check', '--gate', 'merge', '--branch', '--repo')).code).toBe(19);
    await otea('move', task, 'implementing__review');
    expect((await otea('check', '--gate', 'push', '--branch', '--repo')).code).toBe(19);
    person(task, 'done');

    expect((await otea('check', '--gate', 'merge', '--branch', '--repo')).code).toBe(0);
    expect((await otea('check', '--gate', 'push', '--branch', '--repo')).code).toBe(19);
  });

  it('knows a clone of the repo in another folder by the repo’s name, not the folder’s', async () => {
    const clone = tempGitRepo();
    try {
      const at = cliAt(clone.dir, { OTEA_AGENT: 'claude' });
      execFileSync('git', ['checkout', '--quiet', '-b', 'chg-1/keys'], { cwd: clone.dir });
      execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/keys'], {
        cwd: clone.dir,
      });
      const { id } = JSON.parse((await otea('projects', 'current', '--json')).out);
      await at('projects', 'add', '.', '--to', id);

      expect(await at('check', '--gate', 'push', '--branch', '--repo')).toMatchObject({
        code: 19,
        out: `push refused: ${task} is in Propuesta; its branch can be pushed only while Implementar is being done.\n`,
      });
    } finally {
      clone.remove();
    }
  });

  it('reads in the repos of a project from before, under the names its items give them', async () => {
    const project = openProject(repo.dir);
    try {
      project.db.exec('DELETE FROM repos; UPDATE project SET repos_read = 0');
    } finally {
      project.db.close();
    }
    const clone = tempGitRepo();
    try {
      execFileSync('git', ['remote', 'add', 'origin', ORIGIN], { cwd: clone.dir });
      const { id } = JSON.parse((await otea('projects', 'current', '--json')).out);
      await cliAt(clone.dir)('projects', 'add', '.', '--to', id);

      expect(await json('repos', 'list')).toEqual([
        { name, identity: 'remote:github.com/acme/keys' },
      ]);
    } finally {
      clone.remove();
    }
  });

  it('refuses, in a project, a push from a repo it cannot tell is one of the project’s', async () => {
    const nested = join(repo.dir, 'vendor', 'lib');
    mkdirSync(nested, { recursive: true });
    execFileSync('git', ['init', '--quiet', '-b', 'chg-1/keys'], { cwd: nested });
    const result = await cliAt(nested)('check', '--gate', 'push', '--branch', '--repo');

    expect(result).toMatchObject({ code: 19, out: '' });
    expect(result.err).toContain(`push refused: cannot tell which repo ${nested}`);
    expect(result.err).toContain('otea repos add');

    const commit = ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty'];
    execFileSync('git', [...commit, '--quiet', '-m', 'one'], { cwd: nested });
    expect((await cliAt(nested)('repos', 'add', '--name', 'lib')).code).toBe(0);
    const named = await cliAt(nested)('check', '--gate', 'push', '--branch', '--repo');
    expect(named.code).toBe(0);
    expect(named.err).toContain('no item with a push gate matches');
  });

  it('takes the branch and the repo by name, and other fields with --field', async () => {
    const named = ['--branch', 'chg-1/keys', '--repo', name, '--json'];

    expect(await json('check', '--gate', 'push', ...named.slice(0, -1))).toEqual({
      gate: 'push',
      allowed: false,
      items: [
        expect.objectContaining({
          id: task,
          allowed: false,
          text: `push refused: ${task} is in Propuesta; its branch can be pushed only while Implementar is being done.`,
        }),
      ],
    });
    expect(
      (await otea('check', '--gate', 'push', '--field', `repo=${name}`, '--field', 'pr=#1')).code,
    ).toBe(0);
  });

  it('allows the action, with a note on stderr, when nothing matches or nothing gates it', async () => {
    for (const argv of [
      ['--gate', 'push', '--branch', 'other'],
      ['--gate', 'merge', '--branch', '--repo', 'elsewhere'],
    ]) {
      const result = await otea('check', ...argv);
      expect(result).toMatchObject({ code: 0, out: '' });
      expect(result.err).toContain('no item with a');
    }
    expect(await json('check', '--gate', 'push', '--branch', 'other')).toMatchObject({
      allowed: true,
      items: [],
    });
  });

  it('fails open outside a project, and when there is no branch to default to', async () => {
    const elsewhere = tempGitRepo();
    try {
      const outside = await cliAt(elsewhere.dir)('check', '--gate', 'push', '--branch', 'x');
      expect(outside).toMatchObject({ code: 0, out: '' });
      expect(outside.err).toContain('could not check');
    } finally {
      elsewhere.remove();
    }
    const plain = join(repo.dir, '..', `${name}-plain`);
    mkdirSync(plain);
    const noGit = await cliAt(plain)('check', '--gate', 'push', '--branch');
    expect(noGit).toMatchObject({ code: 0 });
    expect(noGit.err).toContain('could not check');
  });

  it('still refuses a field given twice as a usage error', async () => {
    const result = await otea('check', '--gate', 'push', '--branch', '--field', 'branch=x');

    expect(result.code).toBe(2);
    expect(result.err).toContain('Field "branch" given twice');
  });

  it('refuses a field no board or preset names as a usage error, not a silent allow', async () => {
    const result = await otea('check', '--gate', 'push', '--branch', 'x', '--field', 'Rpo=api');

    expect(result.code).toBe(2);
    expect(result.err).toContain('"Rpo"');
  });

  it('refuses a gate nobody declares as a usage error, naming the gates there are', async () => {
    for (const gate of ['deploy', 'psuh']) {
      const result = await otea('check', '--gate', gate, '--branch', '--repo');

      expect(result.code).toBe(2);
      expect(result.out).toBe('');
      expect(result.err).toContain(`Unknown gate "${gate}"; the gates are merge, push`);
    }
  });

  it('matches the repo whatever its case, as git hosts and the folder it defaults to do', async () => {
    for (const repoName of [name.toUpperCase(), name.toLowerCase()]) {
      const result = await otea('check', '--gate', 'push', '--branch', '--repo', repoName);

      expect(result.code).toBe(19);
      expect(result.out).toContain(`push refused: ${task}`);
    }
  });

  it('gives a refused gate its own exit code, not the one of an unexpected failure', async () => {
    expect(EXIT_CODES.gate_refused).toBe(19);
    const codes = Object.entries(EXIT_CODES).filter(([, code]) => code === 19);
    expect(codes).toEqual([['gate_refused', 19]]);
  });

  describe('with the base branch protected', () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repo.dir, stdio: 'pipe', encoding: 'utf8' }).trim();
    const commit = (message: string) =>
      git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        message,
      );
    const push = (...argv: string[]) => otea('check', '--gate', 'push', ...argv);

    // The person turns on "protect the base branch too" in Studio and publishes.
    beforeEach(() => {
      const project = openProject(repo.dir);
      try {
        const board = listBoardSummaries(project).find(
          ({ collection }) => collection === 'Tareas de repo',
        );
        const live = board && getBoardRecord(project, board.id).live;
        if (!board || !live) throw new Error('no Tareas de repo board');
        const def = structuredClone(live.definition);
        const branch = Object.values(def.parts).find((part) => part.guard);
        if (!branch?.guard) throw new Error('no protected branch');
        branch.guard.base = 'main';
        saveDraft(project, board.id, { definition: def, baseVersion: live.version });
        publishBoard(project, board.id, { moves: {}, by: { kind: 'human', name: 'ana' } });
      } finally {
        project.db.close();
      }
      commit('root');
      git('branch', 'main');
      git('update-ref', 'refs/remotes/origin/main', 'main');
    });

    it('refuses a local merge into the base while the item is reviewed, and allows it once Done', async () => {
      person(task, 'implementing');
      commit('keys');
      await otea('move', task, 'implementing__review');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');

      expect(await push('--branch', '--repo')).toEqual({
        code: 19,
        out: `push refused: ${task} is in Implementar, round 1; main takes its branch only once ${task} is Done.\n`,
        err: '',
      });
      person(task, 'done');
      expect(await push('--branch', '--repo')).toMatchObject({
        code: 0,
        out: `push allowed: ${task} is Done; main takes its branch.\n`,
      });
    });

    it('stops a real push into the base through the pre-push hook until the item is Done', async () => {
      const remote = tempGitRepo();
      try {
        const bare = join(remote.dir, 'origin.git');
        execFileSync('git', ['init', '-q', '--bare', bare]);
        git('push', '-q', '--no-verify', bare, 'main:main');
        installGitHook(repo.dir, fileURLToPath(new URL('./main.ts', import.meta.url)));
        person(task, 'implementing');
        commit('keys');
        await otea('move', task, 'implementing__review');
        git('checkout', '-q', 'main');
        git('merge', '-q', '--ff-only', 'chg-1/keys');

        const refused = (() => {
          try {
            git('push', '-q', bare, 'main');
            return 'pushed';
          } catch (error) {
            return String((error as { stdout?: string }).stdout);
          }
        })();
        expect(refused).toContain(
          `push refused: ${task} is in Implementar, round 1; main takes its branch only once ${task} is Done.`,
        );
        expect(git('--git-dir', bare, 'rev-parse', 'main')).not.toBe(git('rev-parse', 'main'));
        person(task, 'done');
        git('push', '-q', bare, 'main');
        expect(git('--git-dir', bare, 'rev-parse', 'main')).toBe(git('rev-parse', 'main'));
      } finally {
        remote.remove();
      }
    });

    it('refuses an agent’s git push into the base by what it sends, as a Claude Code hook', async () => {
      const hooked = (command: string) => {
        const event = { cwd: repo.dir, tool_name: 'Bash', tool_input: { command } };
        const at = cliAt(repo.dir, {}, undefined, undefined, undefined, JSON.stringify(event));
        return at('check', '--gate', 'push', '--branch', '--repo', '--claude-hook');
      };
      person(task, 'implementing');
      commit('keys');
      await otea('move', task, 'implementing__review');

      const sent = await hooked('git push origin chg-1/keys:main');
      expect(sent.code).toBe(2);
      expect(sent.err).toContain(`main takes its branch only once ${task} is Done`);
      expect((await hooked('git push origin main')).code).toBe(2);
      expect((await hooked('git push origin --delete main')).code).toBe(2);
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');
      expect((await hooked('git push')).code).toBe(2);
      person(task, 'done');
      expect((await hooked('git push origin main')).code).toBe(0);
      expect((await hooked('git push origin HEAD:main')).code).toBe(0);
    });

    it('refuses a push to the base that brings in no item, by the commits the push sends', async () => {
      const root = git('rev-parse', 'HEAD');
      git('checkout', '-q', 'main');
      commit('straight onto main');
      const head = git('rev-parse', 'HEAD');
      const none =
        'push refused: main is the base branch Tareas de repo protects; it takes only the branch of a Tarea de repo that is Done, and this push brings in none.\n';

      expect(await push('--branch', '--repo')).toEqual({ code: 19, out: none, err: '' });
      expect(await push('--branch', 'main', '--repo', '--commits', `${root}..${head}`)).toEqual({
        code: 19,
        out: none,
        err: '',
      });
      expect(
        (await push('--branch', 'main', '--repo', '--commits', `${head}..${'0'.repeat(40)}`)).code,
      ).toBe(19);
      expect((await push('--branch', 'other', '--repo')).code).toBe(0);
    });
  });
});
