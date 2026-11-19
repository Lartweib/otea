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
    const created = await otea(
      'create',
      '--collection',
      'Código',
      '--title',
      'Regar',
      '--field',
      'Qué quiero=x',
      '--field',
      'Rama=main',
      '--json',
    );
    id = JSON.parse(created.out).id;
    const project = openProject(repo.dir);
    try {
      const doit = liveBoardOf(project, 'Código')?.def.steps.find(({ name }) => name === 'Hacerlo');
      if (!doit) throw new Error('no Hacerlo');
      updateItemState(
        project.db,
        id,
        stateOf({ step: doit.id, phase: 'doing' }),
        '2026-11-19T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
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

    const project = openProject(repo.dir);
    try {
      approveItem(project, { id, actor: { kind: 'human', name: 'lucia' }, channel: 'ui' });
    } finally {
      project.db.close();
    }
    expect(await pushMain()).toMatchObject({ code: 0 });

    change('extra.py', 'never reviewed\n');
    expect((await pushMain()).code).toBe(19);
  });
});
