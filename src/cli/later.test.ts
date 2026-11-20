import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveBoardOf } from '../app/next.ts';
import { leaveNote } from '../app/notes.ts';
import { openProject } from '../app/project.ts';
import { stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// «Déjala para más tarde» led to a plain release, and next and wait offered the item straight back,
// so the agent stopped waiting, and later wrote a polling loop of its own (P3C-R3-2): what it is
// offered again after it let go of it says how to set it aside, and to keep waiting with otea wait.
describe('an item the agent let go of, offered again', () => {
  let repo: TempRepo;
  let otea: Cli;
  const LATER =
    'You released CAM-1: if the person asked you to leave it for later, otea release CAM-1 --later sets it aside, so next and wait skip it; then keep waiting with otea wait, never a polling loop of your own.';

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
      'Facturas',
      '--field',
      'Qué quiero=x',
    );
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
        '2026-11-18T10:00:00Z',
      );
    } finally {
      project.db.close();
    }
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
  });

  afterEach(() => repo.remove());

  it('says how to set it aside when next and wait offer it back after a plain release', async () => {
    expect((await otea('release', 'CAM-1')).code).toBe(0);

    const next = await otea('next');
    expect(next.out).toContain(LATER);
    const waited = await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s');
    expect(waited.code, waited.err).toBe(0);
    expect(waited.out).toContain(LATER);

    expect((await otea('release', 'CAM-1', '--later')).code).toBe(0);
    expect((await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s')).code).toBe(13);
  });

  it('never sets aside an item another agent holds', async () => {
    expect((await otea('release', 'CAM-1')).code).toBe(0);
    declareProfiles(repo.dir, 'kiln');
    expect((await otea('claim', 'CAM-1', '--as', 'kiln')).code).toBe(0);
    const refused = await otea('release', 'CAM-1', '--later');
    expect(refused.code).toBe(12);
    expect(refused.err).toContain('only kiln can renew or release it');
  });

  // P7-R3-1: what is not agent work right now comes back on its own; a set-aside only hid it.
  it('refuses to set aside an item on the person’s turn (exit 4), saying how to let go of it', async () => {
    const project = openProject(repo.dir);
    try {
      const doit = liveBoardOf(project, 'Cambios')?.def.steps.find(
        ({ name }) => name === 'Hacerlo',
      );
      if (!doit) throw new Error('no Hacerlo');
      const review = stateOf({ step: doit.id, phase: 'review' });
      updateItemState(project.db, 'CAM-1', review, '2026-11-18T10:05:00Z');
    } finally {
      project.db.close();
    }

    const refused = await otea('release', 'CAM-1', '--later');

    expect(refused.code).toBe(4);
    expect(refused.err).toContain(
      'CAM-1 is in the review of Hacerlo, on the person’s turn: otea next offers it again once it is back on an agent’s; nothing to set aside. To let go of it: otea release CAM-1',
    );
  });

  // P7-R3-1: a phone note on an item the agent had set aside did not wake its wait.
  it('wakes the waiting agent once the person leaves a note on an item it set aside', async () => {
    expect((await otea('release', 'CAM-1', '--later')).code).toBe(0);
    expect((await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s')).code).toBe(13);
    const project = openProject(repo.dir);
    try {
      const note = { id: 'CAM-1', text: 'Ya toca', channel: 'ui' as const };
      leaveNote(project, { ...note, actor: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }

    const woke = await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s');

    expect(woke.code, woke.err).toBe(0);
    expect(woke.out).toMatch(/^CAM-1 /);
    expect((await otea('events', '--item', 'CAM-1')).out).toContain(
      "set_aside_lifted  quill's set-aside (the person left note 1)",
    );
  });

  // P7-R3-8: the person took the item up again with a note; the agent's wait showed only the row,
  // and the agent set it aside again, the note unanswered. P5-R3-8: nothing said to do it now.
  it('shows what woke it: the person took it up again, and their note, with the reply', async () => {
    expect((await otea('release', 'CAM-1', '--later')).code).toBe(0);
    const project = openProject(repo.dir);
    try {
      const note = { id: 'CAM-1', text: 'Retómala ya:\nsin premios', channel: 'ui' as const };
      leaveNote(project, { ...note, actor: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }

    const woke = await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s');

    expect(woke.code, woke.err).toBe(0);
    expect(woke.out).toMatch(/\nThe person took it up again \(note 1, .+ UTC\): do it now\.\n/);
    expect(woke.out).toContain(
      [
        'Notes from the person: 1, 1 unanswered',
        '  1 · "Retómala ya:',
        '      sin premios"',
        '      unanswered: otea reply CAM-1 --note 1 "<your short answer>"',
      ].join('\n'),
    );
  });

  it('sets it aside again only once the note is answered and the person’s newer words relayed', async () => {
    expect((await otea('release', 'CAM-1', '--later')).code).toBe(0);
    const project = openProject(repo.dir);
    try {
      const note = { id: 'CAM-1', text: 'Retómala ya', channel: 'ui' as const };
      leaveNote(project, { ...note, actor: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }

    const unanswered = await otea('release', 'CAM-1', '--later');
    expect(unanswered.code).toBe(4);
    expect(unanswered.err).toContain(
      'Not set aside CAM-1: note 1 from the person is unanswered ("Retómala ya"). Answer it first: otea reply CAM-1 --note 1 "<your short answer>"',
    );
    expect((await otea('reply', 'CAM-1', '--note', '1', 'Voy')).code).toBe(0);
    const retaken = await otea('release', 'CAM-1', '--later');
    expect(retaken.code).toBe(4);
    expect(retaken.err).toContain(
      'If they asked you since to leave it for later, relay their words: otea release CAM-1 --later --quote "<the person\'s words>"',
    );

    const quoted = await otea(
      'release',
      'CAM-1',
      '--later',
      '--quote',
      'Mejor la semana que viene',
    );
    expect(quoted.code, quoted.err).toBe(0);
    expect((await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s')).code).toBe(13);
  });

  it('takes --quote only with --later', async () => {
    const refused = await otea('release', 'CAM-1', '--quote', 'Luego');
    expect(refused.code).toBe(2);
    expect(refused.err).toContain('--quote goes with --later');
  });

  it('says nothing of it on an item the agent never let go of', async () => {
    const next = await otea('next');
    expect(next.out).not.toContain('--later');
  });
});
