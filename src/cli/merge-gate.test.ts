import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveItem, liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, seedOnceWithOrigin, type TempRepo } from './testing.ts';

// A forge merge (a script, a CLI or the PR's button) merges the branch as the remote has it, which
// a teammate's clone without Otea's hook can still push to after the approval (P3C-R3-1): the merge
// gate fetches the branch and lets the merge go only when it is what the person approved.
describe('the merge gate on an approved branch', () => {
  let repo: TempRepo;
  let origin: string;
  let teammate: string;
  let otea: Cli;
  const BRANCH = 'feat/bill-102';
  const gitAt =
    (dir: string, name = 't') =>
    (...args: string[]) =>
      execFileSync('git', ['-c', `user.name=${name}`, '-c', 'user.email=t@t', ...args], {
        cwd: dir,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim();
  const git = (...args: string[]) => gitAt(repo.dir)(...args);
  const merge = (...argv: string[]) =>
    otea('check', '--gate', 'merge', '--branch', BRANCH, ...argv);

  // The agent handed off CAM-1 on BRANCH, pushed, and the person approved it into Integrar: seeded
  // once, each test gets its own copy of the checkout and of origin.
  const seeded = seedOnceWithOrigin(async (dir, bare) => {
    const otea = cliAt(dir, { OTEA_AGENT: 'quill' });
    const person = cliAt(dir);
    const git = gitAt(dir);
    await person('init', '--local', '--template', 'none');
    await person('board', 'add', 'Cambios', '--template', 'changes');
    declareProfiles(dir, 'quill');
    await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Facturas',
      '--field',
      'Qué quiero=x',
      '--field',
      `Rama=${BRANCH}`,
    );
    writeFileSync(join(dir, 'a.txt'), 'root\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'root');
    git('branch', '-M', 'main');
    git('remote', 'add', 'origin', bare);
    git('push', '-q', '--no-verify', 'origin', 'main');
    git('checkout', '-q', '-b', BRANCH);
    writeFileSync(join(dir, 'b.txt'), 'facturas\n');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'facturas');
    git('push', '-q', '--no-verify', '-u', 'origin', BRANCH);
    const project = openProject(dir);
    try {
      const doit = liveBoardOf(project, 'Cambios')?.def.steps.find(
        ({ name }) => name === 'Hacerlo',
      );
      if (!doit) throw new Error('no Hacerlo');
      updateItemState(
        project.db,
        'CAM-1',
        stateOf({ step: doit.id, phase: 'doing' }),
        '2026-11-18T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
    writeFileSync(join(dir, 'facturas.diff'), 'diff --git a/b.txt b/b.txt\n+facturas\n');
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
    expect((await otea('attach', 'CAM-1', 'facturas.diff')).code).toBe(0);
    const handed = await otea('handoff', 'CAM-1', '--note', 'facturas');
    expect(handed.code, handed.err).toBe(0);
    const approving = openProject(dir);
    try {
      approveItem(approving, {
        id: 'CAM-1',
        actor: { kind: 'human', name: 'marta' },
        channel: 'ui',
      });
    } finally {
      approving.db.close();
    }
  });

  beforeEach(() => {
    ({ repo, origin, aside: teammate } = seeded.fresh());
    otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
  });

  afterEach(() => repo.remove());

  // A teammate pushes to the branch from a clone with no hook, after the person approved it.
  const teammatePushes = () => {
    gitAt(teammate)('clone', '-q', origin, 'clone');
    const diego = gitAt(join(teammate, 'clone'), 'Diego');
    diego('checkout', '-q', BRANCH);
    writeFileSync(join(teammate, 'clone', 'c.txt'), 'never reviewed\n');
    diego('add', 'c.txt');
    diego('commit', '-q', '-m', 'quick fix');
    diego('push', '-q', '--no-verify', 'origin', BRANCH);
    return diego('rev-parse', '--short=7', 'HEAD');
  };

  it('names the approved tip in Integrar, and the check to run right before any merge', async () => {
    const approved = git('rev-parse', '--short=7', BRANCH);
    const check = `otea check --gate merge --branch ${BRANCH}`;
    for (const argv of [['show', 'CAM-1'], ['next']]) {
      const said = await otea(...argv);
      expect(said.code, said.err).toBe(0);
      expect(said.out).toContain(`the person approved CAM-1 at ${approved}.`);
      expect(said.out).toContain(
        `Right before any merge, a forge's too (a script, a CLI or the PR's button), run ${check}; if it refuses, merge nothing and ask the person: otea ask CAM-1 "<question>".`,
      );
    }
  });

  it('lets the merge go while the remote branch is the approved tip', async () => {
    const checked = await merge();
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out, checked.err).toContain('merge allowed');
  });

  it('refuses once the remote branch moved past the approved tip, naming both commits and who added them', async () => {
    const approved = git('rev-parse', '--short=7', BRANCH);
    const pushed = teammatePushes();
    // This checkout has not fetched the teammate's commit: the gate fetches it.
    expect(git('rev-parse', '--short=7', `origin/${BRANCH}`)).toBe(approved);

    const checked = await merge();
    expect(checked.code).toBe(19);
    expect(checked.out).toContain(`the person approved ${BRANCH} at ${approved}`);
    expect(checked.out).toContain(`origin/${BRANCH} is at ${pushed}`);
    expect(checked.out).toContain(`${pushed} by Diego`);
    expect(checked.out).toContain('otea ask CAM-1');

    const main = git('rev-parse', '--short=7', 'main');
    const given = await merge('--commits', `${main}..${pushed}`);
    expect(given.code).toBe(19);
    expect(given.out).toContain(`${pushed} by Diego`);
  });

  // main moved on the remote; the agent rebased the approved branch onto it and pushed it.
  const rebaseOntoMovedMain = (extra?: string) => {
    const other = gitAt(join(teammate, 'clone'), 'Lucía');
    gitAt(teammate)('clone', '-q', origin, 'clone');
    writeFileSync(join(teammate, 'clone', 'd.txt'), 'meanwhile\n');
    other('add', 'd.txt');
    other('commit', '-q', '-m', 'meanwhile on main');
    other('push', '-q', '--no-verify', 'origin', 'main');
    git('fetch', '-q', 'origin');
    git('rebase', '-q', 'origin/main');
    if (extra) {
      writeFileSync(join(repo.dir, 'e.txt'), `${extra}\n`);
      git('add', 'e.txt');
      git('commit', '-q', '-m', extra);
    }
    git('push', '-q', '--no-verify', '--force', 'origin', BRANCH);
    return git('rev-parse', '--short=7', 'HEAD');
  };

  it('lets a rebase of the approved branch onto a main that moved go, when it holds the same change', async () => {
    rebaseOntoMovedMain();
    const checked = await merge();
    expect(checked.code, checked.out + checked.err).toBe(0);
  });

  it('names only the commit nobody reviewed when a rebase brings one more', async () => {
    const added = rebaseOntoMovedMain('one more');
    const checked = await merge();
    expect(checked.code).toBe(19);
    expect(checked.out).toContain(`1 commit nobody reviewed: ${added} by t`);
  });

  it('refuses, saying it could not check, when it cannot fetch the branch', async () => {
    git('remote', 'set-url', 'origin', join(teammate, 'gone.git'));
    const checked = await merge();
    expect(checked.code).toBe(19);
    expect(checked.out).toContain('could not check');
  });
});
