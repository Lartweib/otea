import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveItem, liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { stateOf } from '../core/board/engine.ts';
import { selectEvents, updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, tempGitRepo } from './testing.ts';

// Before the branch freezes in review, the handoff checks the branch Rama names (P1-R2-2,
// P3C-R2-2, P7-8): it must be in this checkout, and on a step that pushes it, the remote must hold
// every commit of it; one never pushed is handed off with a warning the person sees too.
describe('a handoff of a branch', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
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
  const BRANCH = 'cambio/1-regar';
  const handoff = () => otea('handoff', 'CAM-1', '--note', 'regar');

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
    change('a.txt', 'root\n');
    git('branch', '-M', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', '-b', BRANCH);
    change('b.txt', 'regar\n');
    const project = openProject(repo.dir);
    try {
      const doit = liveBoardOf(project, 'Cambios')?.def.steps.find(
        ({ name }) => name === 'Hacerlo',
      );
      if (!doit) throw new Error('no Hacerlo');
      updateItemState(
        project.db,
        'CAM-1',
        stateOf({ step: doit.id, phase: 'doing' }),
        '2026-11-19T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
    writeFileSync(join(repo.dir, 'regar.diff'), 'diff --git a/b.txt b/b.txt\n+regar\n');
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
    expect((await otea('attach', 'CAM-1', 'regar.diff')).code).toBe(0);
  });

  afterEach(() => repo.remove());

  it('refuses a branch with commits its remote never got, on a step that pushes it', async () => {
    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
    change('c.txt', 'after the push\n');

    const refused = await handoff();
    expect(refused.code).toBe(8);
    expect(refused.err).toContain(
      `CAM-1 not handed off: ${BRANCH} holds commits origin/${BRANCH} never got. Push it first (git push origin ${BRANCH}), then hand it off again: once handed off, Rama is frozen while it is reviewed, so the review would never see them.`,
    );
    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
    expect((await handoff()).code).toBe(0);
  });

  it('refuses a Rama this checkout does not have, naming the branch checked out', async () => {
    git('branch', '-m', BRANCH, 'cambio/1-regar-bis');

    const refused = await handoff();
    expect(refused.code).toBe(8);
    expect(refused.err).toContain(
      `CAM-1 not handed off: Rama names ${BRANCH}, a branch this checkout has neither here nor on the remote (you are on cambio/1-regar-bis). Set Rama to the branch that holds the work, otea update CAM-1 --field "Rama=cambio/1-regar-bis", then hand it off again: once handed off, Rama is frozen while it is reviewed.`,
    );
  });

  it('hands off a branch never pushed with a warning, and keeps it for the approval', async () => {
    git('remote', 'add', 'origin', 'https://example.invalid/regar.git');

    const handed = await handoff();
    expect(handed.code).toBe(0);
    expect(handed.out).toContain(
      `Note: ${BRANCH} was never pushed to origin. If the person reviews it on the forge (a pull request), they cannot see it there: once handed off, Rama is frozen while it is reviewed.`,
    );
    const project = openProject(repo.dir);
    try {
      const tip = selectEvents(project.db, 'CAM-1').findLast(({ data }) => data.tip)?.data.tip;
      expect(tip).toMatchObject({ branch: BRANCH, pushed: false });
    } finally {
      project.db.close();
    }
  });

  it('says nothing of pushing in a repo with no remote', async () => {
    const handed = await handoff();
    expect(handed.code).toBe(0);
    expect(handed.out).not.toContain('never pushed');
  });

  // P3C-R3-10: on Integrar, the agent rebased the approved branch here, then the forge
  // squash-merged the branch as pushed on the server. The handoff was refused («holds commits
  // origin/… never got. Push it first»), and the agent force-pushed a merged branch to pass it.
  describe('on the land step, once the forge merged the branch', () => {
    const land = () => otea('handoff', 'CAM-1');
    beforeEach(async () => {
      git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
      expect((await handoff()).code).toBe(0);
      const project = openProject(repo.dir);
      try {
        approveItem(project, {
          id: 'CAM-1',
          actor: { kind: 'human', name: 'fede' },
          channel: 'ui',
        });
      } finally {
        project.db.close();
      }
      expect((await otea('claim', 'CAM-1')).code).toBe(0);
      expect((await otea('update', 'CAM-1', '--field', 'Commit en main=abc1234')).code).toBe(0);
      // main moved on meanwhile, and the agent rebased the branch on it here, never pushing that.
      git('checkout', '-q', 'main');
      change('m.txt', 'main moved\n');
      git('update-ref', 'refs/remotes/origin/main', 'main');
      git('checkout', '-q', BRANCH);
      git('-c', 'core.editor=true', 'rebase', '-q', 'main');
    });

    it('hands it off once what the person approved is in the base, saying why the check passed', async () => {
      // The forge squash-merged the branch as it was pushed, on the server.
      git('checkout', '-q', 'main');
      git('merge', '-q', '--squash', `origin/${BRANCH}`);
      git('commit', '-q', '-m', 'Regar (#12)');
      git('update-ref', 'refs/remotes/origin/main', 'main');
      git('checkout', '-q', BRANCH);

      const handed = await land();
      expect(handed.err).toBe('');
      expect(handed.code).toBe(0);
      expect(handed.out).toContain(
        `${BRANCH} holds commits origin/${BRANCH} never got, but what the person approved is in origin/main already, so they need no push: never push a merged branch to pass a check.`,
      );
    });

    it('still refuses it while what the person approved is not in the base', async () => {
      const refused = await land();
      expect(refused.code).toBe(8);
      expect(refused.err).toContain(`${BRANCH} holds commits origin/${BRANCH} never got`);
    });
  });
});
