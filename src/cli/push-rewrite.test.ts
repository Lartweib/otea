import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { oteaLauncher } from '../app/launcher.ts';
import { liveBoardOf, sendBackItem } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { installGitHook } from './hooks.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

// P1-R3-3: a subagent force-pushed CAM-4's branch in Hacerlo, round 3, while another agent worked
// on it, and the pre-push hook let it pass though the board said never to force-push. Once an
// item was handed off, its branch on the remote holds what the person reviewed: a push that is no
// fast-forward of it is refused. Before the first handoff a rewrite is the agent's own business.
describe('a push that rewrites an item branch', () => {
  let repo: TempRepo;
  let otea: Cli;
  const BRANCH = 'cambio/1-regar';
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
  // What the pre-push hook runs for a push of the branch from what the remote has to the tip here.
  const push = (from: string) =>
    otea(
      'check',
      '--gate',
      'push',
      '--branch',
      BRANCH,
      '--commits',
      `${from}..${git('rev-parse', 'HEAD')}`,
    );
  const rewrite = () => {
    const remote = git('rev-parse', 'HEAD');
    git('commit', '-q', '--amend', '-m', 'regar, reworded');
    return remote;
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
    change('a.txt', 'root\n');
    git('branch', '-M', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', '-b', BRANCH);
    change('b.txt', 'regar\n');
    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
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

  it('lets a rewrite through before the first handoff', async () => {
    const from = rewrite();
    expect((await push(from)).code).toBe(0);
  });

  describe('once the item was handed off and sent back', () => {
    let handed: string;
    beforeEach(async () => {
      handed = git('rev-parse', '--short=7', 'HEAD');
      const done = await otea('handoff', 'CAM-1', '--note', 'regar');
      expect(done.code, done.err).toBe(0);
      const project = openProject(repo.dir);
      try {
        sendBackItem(project, {
          id: 'CAM-1',
          actor: { kind: 'human', name: 'ana' },
          channel: 'ui',
          reason: 'riega también el patio',
        });
      } finally {
        project.db.close();
      }
    });

    it('refuses a push that is no fast-forward, naming the item and the tip handed off', async () => {
      const from = rewrite();
      const refused = await push(from);
      expect(refused.code).toBe(19);
      expect(refused.out).toContain(
        `push refused: CAM-1 was handed off for review at ${handed}, and this push rewrites ${BRANCH} on the remote instead of adding to it: what the review read, and any commit another agent added, would be gone from it. Add commits on top; to bring in main, merge it (git merge origin/main) rather than rebase.`,
      );
      expect(refused.out).toContain(
        'Para la persona: si quieres reescribir la rama, súbela tú esta vez con git push --force-with-lease --no-verify, que se salta la revisión de Otea. Un agente nunca usa --no-verify.',
      );
    });

    it('lets a fast-forward through', async () => {
      const from = git('rev-parse', 'HEAD');
      change('c.txt', 'patio\n');
      expect((await push(from)).code).toBe(0);
    });

    it('refuses a push over commits this clone never fetched', async () => {
      const from = git('rev-parse', 'HEAD');
      git('reset', '-q', '--hard', 'HEAD~1');
      change('c.txt', 'patio\n');
      const unknown = git('rev-parse', from).replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
      expect((await push(unknown)).code).toBe(19);
    });

    // As the persona did it: git push --force-with-lease through the hook Otea installs, to a real
    // remote; the person's way past it is --no-verify.
    it('stops a real force push at the hook, and lets the person push past it with --no-verify', async () => {
      const bare = join(repo.dir, '..', `${basename(repo.dir)}-origin.git`);
      execFileSync('git', ['init', '-q', '--bare', bare]);
      try {
        git('remote', 'add', 'origin', bare);
        // The project knows the repo by its origin now, as once a clone has one.
        expect((await cliAt(repo.dir)('repos', 'add', '--name', 'regar')).code).toBe(0);
        git('push', '-q', '--no-verify', 'origin', 'main', BRANCH);
        installGitHook(repo.dir, oteaLauncher(MAIN, { execPath: process.execPath }));
        rewrite();
        const forced = spawnSync('git', ['push', '--force-with-lease', 'origin', BRANCH], {
          cwd: repo.dir,
          encoding: 'utf8',
          env: { ...process.env, OTEA_AGENT: 'quill' },
        });
        expect(forced.status, forced.stderr).not.toBe(0);
        expect(forced.stdout + forced.stderr).toContain(
          `CAM-1 was handed off for review at ${handed}`,
        );
        expect(git('rev-parse', '--short=7', `origin/${BRANCH}`)).toBe(handed);

        git('push', '-q', '--force-with-lease', '--no-verify', 'origin', BRANCH);
        expect(git('rev-parse', `origin/${BRANCH}`)).toBe(git('rev-parse', 'HEAD'));
      } finally {
        rmSync(bare, { recursive: true, force: true });
      }
    });
  });
});
