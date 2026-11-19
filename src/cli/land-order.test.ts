import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveBoardOf } from '../app/next.ts';
import { setOrder } from '../app/priority.ts';
import { openProject } from '../app/project.ts';
import { updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// P1-R3-2: two agents landing at once raced lower items into main before the person's first. At
// the command line, otea next offers the first in the order and otea claim refuses the others,
// saying which lands first and why.
describe('landing in the person order', () => {
  let repo: TempRepo;
  let quill: Cli;
  let claude: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    quill = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
    claude = cliAt(repo.dir, { OTEA_AGENT: 'claude-b' });
    const person = cliAt(repo.dir);
    await person('init', '--template', 'none');
    await person('board', 'add', 'Cambios', '--template', 'changes');
    declareProfiles(repo.dir, 'quill', 'claude-b');
    for (const title of ['Uno', 'Dos']) {
      await quill(
        'create',
        '--collection',
        'Cambios',
        '--title',
        title,
        '--field',
        'Qué quiero=x',
        '--field',
        `Rama=cambio/${title}`,
      );
    }
    const project = openProject(repo.dir);
    try {
      const land = liveBoardOf(project, 'Cambios')?.def.steps.find(
        ({ name }) => name === 'Integrar',
      );
      if (!land) throw new Error('no Integrar');
      for (const id of ['CAM-1', 'CAM-2'])
        updateItemState(project.db, id, land.id, '2026-11-19T10:00:00Z');
      setOrder(project, {
        collection: 'Cambios',
        ids: ['CAM-2', 'CAM-1'],
        actor: { kind: 'human', name: 'fede' },
      });
    } finally {
      project.db.close();
    }
  });

  afterEach(() => repo.remove());

  it('offers the first in the order, refuses the other while it lands, then offers it', async () => {
    const refused = await quill('claim', 'CAM-1');
    expect(refused.code).toBe(4);
    expect(refused.err).toContain(
      'CAM-1 not claimed: CAM-2 lands in main first (order 1), then CAM-1: one agent lands at a time on main',
    );

    expect((await claude('next', '--claim')).out).toContain('CAM-2');
    const held = await quill('claim', 'CAM-1');
    expect(held.code).toBe(4);
    expect(held.err).toContain(
      'CAM-1 not claimed: claude-b lands CAM-2 in main now; CAM-1 lands after it',
    );
    const waiting = await quill('next');
    expect(waiting.out).toContain(
      'CAM-1 waits to land in main: claude-b lands CAM-2 there now; one agent lands at a time on main',
    );
  });
});
