import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveItem, liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import {
  type Cli,
  cliAt,
  declareProfiles,
  SEED_TIMEOUT_MS,
  type SeededRepo,
  seededLocalRepo,
  type TempRepo,
} from './testing.ts';

// Once the person approves an item, Integrar lands only what they approved (P3C-R2-1): the handoff
// records the branch's tip, and the push gate refuses a new commit on the branch and a main whose
// content differs, while a rebase onto main with the same result still lands.
describe('the approved tip', () => {
  let seeded: SeededRepo;
  let repo: TempRepo;
  let otea: Cli;
  const gitAt =
    (dir: string) =>
    (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: dir,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim();
  const changeAt = (dir: string) => (file: string, text: string, message: string) => {
    writeFileSync(join(dir, file), text);
    gitAt(dir)('add', file);
    gitAt(dir)('commit', '-q', '-m', message);
  };
  const git = (...args: string[]) => gitAt(repo.dir)(...args);
  const change = (file: string, text: string, message: string) =>
    changeAt(repo.dir)(file, text, message);
  const push = (...argv: string[]) => otea('check', '--gate', 'push', ...argv);
  const BRANCH = 'cambio/1-regar';

  // The agent did Hacerlo and handed it off; the person approved it into Integrar. Seeded once,
  // each test gets its own copy: seeding it before every test cost a loaded Windows runner ~10s.
  beforeAll(async () => {
    seeded = await seededLocalRepo(async (dir) => {
      const otea = cliAt(dir, { OTEA_AGENT: 'quill' });
      const person = cliAt(dir);
      const git = gitAt(dir);
      const change = changeAt(dir);
      await person('init', '--local', '--template', 'none');
      await person('board', 'add', 'Cambios', '--template', 'changes');
      declareProfiles(dir, 'quill');
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
      change('a.txt', 'root\n', 'root');
      git('branch', '-M', 'main');
      git('update-ref', 'refs/remotes/origin/main', 'main');
      git('checkout', '-q', '-b', BRANCH);
      change('b.txt', 'regar\n', 'regar');
      git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
      const project = openProject(dir);
      try {
        const board = liveBoardOf(project, 'Cambios');
        const doit = board?.def.steps.find(({ name }) => name === 'Hacerlo');
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
      writeFileSync(join(dir, 'regar.diff'), 'diff --git a/b.txt b/b.txt\n+regar\n');
      expect((await otea('claim', 'CAM-1')).code).toBe(0);
      expect((await otea('attach', 'CAM-1', 'regar.diff')).code).toBe(0);
      const handed = await otea('handoff', 'CAM-1', '--note', 'regar');
      expect(handed.code, handed.err).toBe(0);
      const approving = openProject(dir);
      try {
        approveItem(approving, {
          id: 'CAM-1',
          actor: { kind: 'human', name: 'ana' },
          channel: 'ui',
        });
      } finally {
        approving.db.close();
      }
    });
  }, SEED_TIMEOUT_MS);

  afterAll(() => seeded.remove());

  beforeEach(() => {
    repo = seeded.fresh();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
  });

  afterEach(() => repo.remove());

  it('lets the approved branch land as it was handed off', async () => {
    expect((await push('--branch', BRANCH)).code).toBe(0);
    git('checkout', '-q', 'main');
    git('merge', '-q', '--ff-only', BRANCH);
    expect(await push('--branch', 'main')).toMatchObject({ code: 0 });
  });

  it('refuses a commit added to the branch after the approval, and main with it', async () => {
    const approved = git('rev-parse', '--short=7', BRANCH);
    change('c.txt', 'never reviewed\n', 'after the approval');
    const branch = await push('--branch', BRANCH);
    expect(branch.code).toBe(19);
    expect(branch.out).toBe(
      `push refused: CAM-1 is being landed in Integrar: the person approved ${BRANCH} at ${approved}, and this push writes changes nobody reviewed. Push only the approved commits, as they are or rebased onto main with the same result; for anything else, take CAM-1 back to Hacerlo (otea handoff CAM-1 --way "Hacerlo" --reason "<why>") so the change is reviewed again.\n`,
    );

    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
    git('checkout', '-q', 'main');
    git('merge', '-q', '--ff-only', BRANCH);
    const main = await push('--branch', 'main');
    expect(main.code).toBe(19);
    expect(main.out).toContain(
      `push refused: main would not hold exactly what the person approved of CAM-1 (${approved} on ${BRANCH})`,
    );
  });

  it('lets a rebase onto a main that moved land, when it holds the same change', async () => {
    git('checkout', '-q', 'main');
    change('d.txt', 'meanwhile\n', 'on main meanwhile');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', BRANCH);
    git('rebase', '-q', 'main');

    expect((await push('--branch', BRANCH)).code).toBe(0);
    git('update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH);
    git('checkout', '-q', 'main');
    git('merge', '-q', '--ff-only', BRANCH);
    expect((await push('--branch', 'main')).code).toBe(0);
  });

  // A conflict in Integrar has a way out the agent takes itself (P1-R2-3): back to Hacerlo, with
  // the reason, where the resolution is reviewed again; the item no longer waits free in Integrar.
  it('lets the agent take a conflicting item back from Integrar to Hacerlo, saying why', async () => {
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
    const back = await otea(
      'handoff',
      'CAM-1',
      '--way',
      'Hacerlo',
      '--reason',
      'the rebase conflicts with main in b.txt',
    );
    expect(back.code, back.err).toBe(0);
    const shown = JSON.parse((await otea('show', 'CAM-1', '--json')).out);
    expect(shown.item?.stateName ?? shown.stateName).toBe('Hacerlo');
  });

  it('refuses a merge into main that adds content of its own', async () => {
    git('checkout', '-q', 'main');
    change('d.txt', 'meanwhile\n', 'on main meanwhile');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('merge', '-q', '--no-ff', '--no-commit', BRANCH);
    writeFileSync(join(repo.dir, 'b.txt'), 'regar, changed while merging\n');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'merge');

    const main = await push('--branch', 'main');
    expect(main.code).toBe(19);
    expect(main.out).toContain('would not hold exactly what the person approved of CAM-1');
  });
});
