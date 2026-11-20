import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { landStepOf, stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, tempGitRepo } from './testing.ts';

// P6-R3-1: the second item landed in a base needs a rebase onto the new main. The agent rebased,
// merged it into main and pushed main: the hook refused it, since the branch held commits its
// remote never got, but said nothing of the push it does allow first (the rebased branch, with
// --force-with-lease), so the agent stopped and asked.
describe('landing a branch rebased onto the base', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  const BRANCH = 'cambio/1-regar';
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo.dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  const change = (file: string) => {
    writeFileSync(join(repo.dir, file), `${file}\n`);
    git('add', file);
    git('commit', '-q', '-m', file);
  };

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
      `Rama=${BRANCH}`,
    );
    change('a.txt');
    git('branch', '-M', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', '-b', BRANCH);
    change('b.txt');
    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
    // Another item landed in main meanwhile.
    git('checkout', '-q', 'main');
    change('c.txt');
    git('update-ref', 'refs/remotes/origin/main', 'main');
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
    // The agent rebases the branch onto the new main and merges it there.
    git('checkout', '-q', BRANCH);
    git('rebase', '-q', 'main');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--ff-only', BRANCH);
  });

  afterEach(() => repo.remove());

  it('refuses main first, naming the push of the rebased branch and then of main', async () => {
    const refused = await otea('check', '--gate', 'push', '--branch');
    expect(refused.code, refused.out + refused.err).toBe(19);
    expect(refused.out).toContain(
      `push refused: ${BRANCH} holds commits origin/${BRANCH} never got, so nobody reviewed them; main takes CAM-1's branch only as it was pushed. To land a branch you rebased onto main, push it first, git push --force-with-lease origin ${BRANCH}, then push main again, git push origin main.`,
    );
  });

  it('lets through the force push it names', async () => {
    const pushed = git('rev-parse', `origin/${BRANCH}`);
    const rebased = git('rev-parse', BRANCH);
    const allowed = await otea(
      'check',
      '--gate',
      'push',
      '--branch',
      BRANCH,
      '--commits',
      `${pushed}..${rebased}`,
    );
    expect(allowed.code, allowed.out).toBe(0);
    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
    const main = await otea('check', '--gate', 'push', '--branch');
    expect(main.code, main.out + main.err).toBe(0);
  });
});
