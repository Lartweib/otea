import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBoardRecord, listBoardSummaries, publishBoard, saveDraft } from '../app/boards.ts';
import { moveItem } from '../app/items.ts';
import { oteaLauncher } from '../app/launcher.ts';
import { openProject } from '../app/project.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { installGitHook } from './hooks.ts';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

// Under a refused push into a protected base, how the person lands a commit of their own
// (P2S-R3-4), in the language of the board, Spanish here.
const FOR_PERSON =
  'Para la persona: si el commit es tuyo, pásalo por el tablero (pídele a tu agente un ítem y apruébalo en Otea) o súbelo tú esta vez con git push --no-verify, que se salta la revisión de Otea. Un agente nunca usa --no-verify.';

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

  it('names the steps beside their ids in --json', async () => {
    const { items } = await json('check', '--gate', 'push', '--branch', '--repo');

    expect(items).toEqual([
      expect.objectContaining({
        stateName: 'Propuesta',
        allowedIn: ['implementing'],
        allowedInNames: ['Implementar'],
      }),
    ]);
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

  // While its branch is frozen in review, an agent attaches nothing: the reviewer would approve
  // work the branch never got (P3C-8).
  it('refuses an agent’s attach while the branch is frozen in review', async () => {
    person(task, 'implementing');
    writeFileSync(join(repo.dir, 'out.log'), 'ok\n');
    expect((await otea('attach', task, 'out.log')).code).toBe(0);
    await otea('move', task, 'implementing__review');

    const frozen = await otea('attach', task, 'out.log', '--caption', 'later');
    expect(frozen.code).toBe(4);
    expect(frozen.err).toContain(
      `Not attached to ${task}: its branch is frozen while Implementar is reviewed, so the reviewer reads only what was handed off. Push and attach once it is sent back.`,
    );
  });

  // Done with its branch not merged yet lists as the desk says it, never as merged (P6-R2-11).
  it('lists a Done item whose branch is not merged yet apart from a merged one', async () => {
    person(task, 'implementing');
    await otea('move', task, 'implementing__review');
    person(task, 'done');
    const listed = await otea('list', '--collection', 'Tareas de repo');
    expect(listed.out).toMatch(new RegExp(`${task}\\s+Done, not merged\\s`));
    await otea('merged', task, '--commit', 'abc1234');
    expect((await otea('list', '--collection', 'Tareas de repo')).out).not.toContain('not merged');
  });

  // An item that names no branch has none to freeze or push (P4-R2-4): the refusal says only that
  // the review holds.
  it('words the refusal without a branch when the item names none', async () => {
    const none = (
      await json(
        'create',
        '--collection',
        'Tareas de repo',
        '--parent',
        'CHANGES-1',
        '--title',
        'Notes',
        '--field',
        `repo=${name}`,
        '--field',
        'branch=notes',
      )
    ).id;
    person(none, 'implementing');
    const project = openProject(repo.dir);
    try {
      // Rama left empty, as on a board where it is optional.
      project.db
        .prepare(
          "UPDATE items SET fields = (SELECT json_group_object(key, CASE WHEN value = 'notes' THEN '' ELSE value END) FROM json_each(items.fields)) WHERE id = ?",
        )
        .run(none);
    } finally {
      project.db.close();
    }
    // Nothing of it may be pushed yet, and show says so, in its Branch lines and its gates (P5-R3-2).
    const shown = (await otea('show', none)).out;
    expect(shown).not.toMatch(/may push|push allowed/);
    expect(shown).toContain('Rama is empty: push nothing until it is set');
    expect(shown).toContain('Gates: push blocked');
    writeFileSync(join(repo.dir, 'out.log'), 'ok\n');
    await otea('move', none, 'implementing__review');

    const refused = await otea('attach', none, 'out.log');
    expect(refused.code).toBe(4);
    expect(refused.err).toContain(
      `Not attached to ${none}: Implementar is being reviewed, so the reviewer reads only what was handed off. Attach it once it is sent back.`,
    );
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
        out: `push refused: ${task} is in Implementar, round 1; main takes its branch only once ${task} is Done.\n${FOR_PERSON}\n`,
        err: '',
      });
      person(task, 'done');
      expect(await push('--branch', '--repo')).toMatchObject({
        code: 0,
        out: `push allowed: ${task} is Done; main takes its branch.\n`,
      });
    });

    it('takes a Done branch this checkout knows only from the remote, as a fresh clone does', async () => {
      person(task, 'implementing');
      commit('keys');
      git('update-ref', 'refs/remotes/origin/chg-1/keys', 'chg-1/keys');
      await otea('move', task, 'implementing__review');
      person(task, 'done');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'origin/chg-1/keys');
      git('branch', '-q', '-D', 'chg-1/keys');

      expect(await push('--branch', '--repo')).toMatchObject({
        code: 0,
        out: `push allowed: ${task} is Done; main takes its branch.\n`,
      });
    });

    it('refuses a local branch that holds commits its remote never got, so nobody reviewed', async () => {
      person(task, 'implementing');
      commit('keys');
      git('update-ref', 'refs/remotes/origin/chg-1/keys', 'chg-1/keys');
      await otea('move', task, 'implementing__review');
      person(task, 'done');
      commit('after the review');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');

      expect(await push('--branch', '--repo')).toEqual({
        code: 19,
        out: `push refused: chg-1/keys holds commits origin/chg-1/keys never got, so nobody reviewed them; main takes ${task}'s branch only as it was pushed.\n${FOR_PERSON}\n`,
        err: '',
      });
    });

    // git switch -c X origin/main gives X the upstream origin/main: what the remote has of X is
    // still origin/X, so an approved branch pushed there lands (P1-R2-1).
    it('compares a branch made from origin/main with origin/<branch>, not with its upstream', async () => {
      person(task, 'implementing');
      commit('keys');
      git('update-ref', 'refs/remotes/origin/chg-1/keys', 'chg-1/keys');
      git('branch', '-q', '--set-upstream-to=origin/main', 'chg-1/keys');
      await otea('move', task, 'implementing__review');
      person(task, 'done');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');

      expect(await push('--branch', '--repo')).toMatchObject({
        code: 0,
        out: `push allowed: ${task} is Done; main takes its branch.\n`,
      });
      git('checkout', '-q', 'chg-1/keys');
      commit('after the review');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');
      expect(await push('--branch', '--repo')).toEqual({
        code: 19,
        out: `push refused: chg-1/keys holds commits origin/chg-1/keys never got, so nobody reviewed them; main takes ${task}'s branch only as it was pushed.\n${FOR_PERSON}\n`,
        err: '',
      });
    });

    it('falls back to the upstream when the remote has no branch of the same name', async () => {
      person(task, 'implementing');
      commit('keys');
      git('branch', '-q', '--set-upstream-to=origin/main', 'chg-1/keys');
      await otea('move', task, 'implementing__review');
      person(task, 'done');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');

      expect(await push('--branch', '--repo')).toEqual({
        code: 19,
        out: `push refused: chg-1/keys holds commits origin/main never got, so nobody reviewed them; main takes ${task}'s branch only as it was pushed.\n${FOR_PERSON}\n`,
        err: '',
      });
    });

    it('refuses a push into the base that brings in commits no item’s branch holds', async () => {
      person(task, 'implementing');
      commit('keys');
      await otea('move', task, 'implementing__review');
      person(task, 'done');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--ff-only', 'chg-1/keys');
      const reviewed = git('rev-parse', 'HEAD');
      commit('never reviewed');
      const extra = git('rev-parse', '--short', 'HEAD');

      expect(await push('--branch', '--repo')).toEqual({
        code: 19,
        out: `push refused: main would take 1 commit no reviewed branch holds (${extra}); it takes only the branches of the items it brings in, as they were pushed.\n${FOR_PERSON}\n`,
        err: '',
      });
      git('reset', '-q', '--hard', reviewed);
      expect((await push('--branch', '--repo')).code).toBe(0);
    });

    it('takes a merge commit that joins a Done branch into the base', async () => {
      person(task, 'implementing');
      commit('keys');
      await otea('move', task, 'implementing__review');
      person(task, 'done');
      git('checkout', '-q', 'main');
      commit('on main meanwhile');
      git('update-ref', 'refs/remotes/origin/main', 'main');
      git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'merge',
        '-q',
        '--no-ff',
        '-m',
        'merge',
        'chg-1/keys',
      );

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
        installGitHook(
          repo.dir,
          oteaLauncher(fileURLToPath(new URL('./main.ts', import.meta.url)), {
            execPath: process.execPath,
          }),
        );
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
        commit('rides along unreviewed');
        const riding = (() => {
          try {
            git('push', '-q', bare, 'main');
            return 'pushed';
          } catch (error) {
            return String((error as { stdout?: string }).stdout);
          }
        })();
        expect(riding).toContain('push refused: main would take 1 commit no reviewed branch holds');
        git('reset', '-q', '--hard', 'chg-1/keys');
        git('push', '-q', bare, 'main');
        expect(git('--git-dir', bare, 'rev-parse', 'main')).toBe(git('rev-parse', 'main'));
      } finally {
        remote.remove();
      }
    });

    it('refuses a push to the base that brings in no item, by the commits the push sends', async () => {
      const root = git('rev-parse', 'HEAD');
      git('checkout', '-q', 'main');
      commit('straight onto main');
      const head = git('rev-parse', 'HEAD');
      const none = `push refused: main is the base branch Tareas de repo protects; it takes only the branch of an item of Tareas de repo that is Done, and this push brings in none.\n${FOR_PERSON}\n`;

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

    // P3C-R3-3: a commit the repo does not have leaves the check blind; it says so, and refuses.
    it('refuses, saying it could not check, a push or merge of a commit this repo does not have', async () => {
      const root = git('rev-parse', 'HEAD');
      const missing = 'f'.repeat(40);
      for (const gate of ['push', 'merge']) {
        const checked = await otea(
          'check',
          '--gate',
          gate,
          '--branch',
          'other',
          '--repo',
          '--commits',
          `${root}..${missing}`,
        );
        expect(checked).toEqual({
          code: 19,
          out: `${gate} refused: could not check: ${missing} is not in this repository; fetch first.\n`,
          err: '',
        });
      }
    });
  });
});
