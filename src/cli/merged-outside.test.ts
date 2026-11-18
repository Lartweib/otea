import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { landStepOf, stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, tempGitRepo } from './testing.ts';

// A branch merged outside Otea leaves its item in Integrar (P1-16): show and next say its branch
// is in main already, and what is left to do.
describe('a branch merged outside Otea', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo.dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
    const person = cliAt(repo.dir);
    await person('init', '--template', 'none');
    await person('board', 'add', 'Cambios', '--template', 'changes');
    declareProfiles(repo.dir, 'quill');
    await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Regar',
      '--field',
      'Qué quiero=x',
      '--field',
      'Rama=cambio/1-regar',
    );
    git('commit', '-q', '--allow-empty', '-m', 'root');
    git('branch', '-M', 'main');
    git('checkout', '-q', '-b', 'cambio/1-regar');
    git('commit', '-q', '--allow-empty', '-m', 'regar');
    git('checkout', '-q', 'main');
    // The item stands in Integrar, approved, with its branch.
    const project = openProject(repo.dir);
    try {
      const board = liveBoardOf(project, 'Cambios');
      const land = board && landStepOf(board.def);
      if (!land) throw new Error('no land step');
      updateItemState(
        project.db,
        'CAM-1',
        stateOf({ step: land.id, phase: 'doing' }),
        '2026-11-18T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
  });

  afterEach(() => repo.remove());

  const line =
    'CAM-1: its branch cambio/1-regar is in main already, merged outside Otea. Nothing is left to merge: fill in what Integrar asks and hand it off (otea handoff CAM-1).';

  it('is said by show and next once main holds the branch', async () => {
    expect((await otea('show', 'CAM-1')).out).not.toContain('merged outside Otea');

    git('merge', '-q', '--ff-only', 'cambio/1-regar');

    expect((await otea('show', 'CAM-1')).out).toContain(line);
    expect((await otea('next')).out).toContain(line);
  });
});
