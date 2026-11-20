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

// P6-R3-2: on Integrar the agent fast-forwarded its local main only, and next said the branch was
// merged outside Otea and to hand it off, which would close the item Done with main unpushed. What
// counts is the base as the remote has it; local main alone says to push it, and the handoff waits.
describe('a branch only the local base holds', () => {
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
    git('remote', 'add', 'origin', 'https://example.invalid/regar.git');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', '-b', 'cambio/1-regar');
    git('commit', '-q', '--allow-empty', '-m', 'regar');
    git('update-ref', 'refs/remotes/origin/cambio/1-regar', 'cambio/1-regar');
    git('checkout', '-q', 'main');
    const project = openProject(repo.dir);
    try {
      const board = liveBoardOf(project, 'Cambios');
      const land = board && landStepOf(board.def);
      if (!land) throw new Error('no land step');
      updateItemState(
        project.db,
        'CAM-1',
        stateOf({ step: land.id, phase: 'doing' }),
        '2026-11-20T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
    git('merge', '-q', '--ff-only', 'cambio/1-regar');
  });

  afterEach(() => repo.remove());

  const local =
    'CAM-1: its branch cambio/1-regar is in your local main, not yet in origin/main: push it (git push origin main), then fill in what Integrar asks and hand it off (otea handoff CAM-1).';

  it('says to push main, not that it was merged outside Otea', async () => {
    const shown = (await otea('show', 'CAM-1')).out;
    expect(shown).toContain(local);
    expect(shown).not.toContain('merged outside Otea');
    expect((await otea('next')).out).toContain(local);
  });

  it('refuses the handoff until the remote has it', async () => {
    const refused = await otea('handoff', 'CAM-1', '--note', 'integrado');
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      'CAM-1 not handed off: cambio/1-regar is in your local main, not yet in origin/main, so closing it would leave it Done with main unpushed. Push it first (git push origin main), then hand it off again.',
    );
  });

  it('says it was merged outside Otea once the remote has it', async () => {
    git('update-ref', 'refs/remotes/origin/main', 'main');
    expect((await otea('show', 'CAM-1')).out).toContain(
      'CAM-1: its branch cambio/1-regar is in main already, merged outside Otea.',
    );
  });
});
