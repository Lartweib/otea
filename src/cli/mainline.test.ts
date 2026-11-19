import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveItem, liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, tempGitRepo } from './testing.ts';

// «No subas nada sin que lo vea» on a project kept on main (P2S-R2-1): the Code on main board
// refuses a push of main until the person approves the item, then lets the approved main go.
describe('the Code on main board', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let id: string;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo.dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  const change = (file: string, text: string) => {
    writeFileSync(join(repo.dir, file), text);
    git('add', file);
    git('commit', '-q', '-m', file);
  };
  const pushMain = () => otea('check', '--gate', 'push', '--branch', 'main');

  // An item of Código, its Rama main, being done in Hacerlo.
  const doing = async (title: string) => {
    const created = await otea(
      'create',
      '--collection',
      'Código',
      '--title',
      title,
      '--field',
      'Qué quiero=x',
      '--field',
      'Rama=main',
      '--json',
    );
    const made: string = JSON.parse(created.out).id;
    const project = openProject(repo.dir);
    try {
      const doit = liveBoardOf(project, 'Código')?.def.steps.find(({ name }) => name === 'Hacerlo');
      if (!doit) throw new Error('no Hacerlo');
      updateItemState(
        project.db,
        made,
        stateOf({ step: doit.id, phase: 'doing' }),
        '2026-11-19T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
    return made;
  };
  const approve = (item: string) => {
    const project = openProject(repo.dir);
    try {
      approveItem(project, { id: item, actor: { kind: 'human', name: 'lucia' }, channel: 'ui' });
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'lu' });
    const person = cliAt(repo.dir);
    await person('init', '--template', 'none');
    const added = await person('board', 'add', 'Código', '--template', 'mainline');
    expect(added.code, added.err).toBe(0);
    declareProfiles(repo.dir, 'lu');
    change('bot.py', 'print(1)\n');
    git('branch', '-M', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    id = await doing('Regar');
  });

  afterEach(() => repo.remove());

  it('refuses a push of main until the person approves, then lets only the approved main go', async () => {
    const claimed = await otea('claim', id);
    expect(claimed.code, claimed.err).toBe(0);
    change('bot.py', 'print(2)\n');
    const early = await pushMain();
    expect(early.code).toBe(19);
    expect(early.out).toContain(`${id} is in Hacerlo`);

    writeFileSync(join(repo.dir, 'regar.diff'), 'diff --git a/bot.py b/bot.py\n');
    expect((await otea('attach', id, 'regar.diff')).code).toBe(0);
    expect((await otea('handoff', id, '--note', 'regar')).code).toBe(0);
    expect((await pushMain()).code).toBe(19);

    approve(id);
    expect(await pushMain()).toMatchObject({ code: 0 });

    change('extra.py', 'never reviewed\n');
    expect((await pushMain()).code).toBe(19);
  });

  // The person's own commit on a protected main got the agents' refusal, in English, with no way
  // out (P2S-R3-4): the refusal also speaks to the person, in the board's language.
  it('tells the person, in the board language, how to land a commit of their own', async () => {
    change('TODO.md', '- regar\n');
    const refused = await pushMain();
    expect(refused.code).toBe(19);
    expect(refused.out).toContain(
      'Para la persona: si el commit es tuyo, pásalo por el tablero (pídele a tu agente un ítem y apruébalo en Otea) o súbelo tú esta vez con git push --no-verify, que se salta la revisión de Otea. Un agente nunca usa --no-verify.',
    );
  });

  // A request with no code change (installing the hook, a question) could not be handed off on a
  // main-only board: «Rama main has no commits over origin/HEAD» (P2S-R3-3). It goes to review as
  // no code change, says so, and a push of main never waits on it.
  it('hands off an item that made no commit, says so, and never holds the push gate for it', async () => {
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    expect((await otea('claim', id)).code).toBe(0);
    writeFileSync(join(repo.dir, 'regar.diff'), 'no changes\n');
    expect((await otea('attach', id, 'regar.diff')).code).toBe(0);
    const handed = await otea('handoff', id, '--note', 'hook installed, nothing to commit');
    expect(handed.code, handed.err).toBe(0);
    expect(handed.out).toContain(
      `${id} goes to review with no commit: main holds nothing the remote lacks, so the person reviews no code change and the push gate does not wait on it.`,
    );

    const other = await doing('Riego doble');
    expect((await otea('claim', other)).code).toBe(0);
    change('bot.py', 'print(3)\n');
    expect((await otea('attach', other, 'regar.diff')).code).toBe(0);
    expect((await otea('handoff', other, '--note', 'riego')).code).toBe(0);
    approve(other);
    expect(await pushMain()).toMatchObject({ code: 0 });
  });
});
