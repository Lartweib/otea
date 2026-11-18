import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { creatures } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { insertEvidence, saveProfile, selectEvents, upsertAgent } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import { approveItem, dropItem, handoffItem, nextFor, sendBackItem } from './next.ts';
import {
  agentNotes,
  editNote,
  leaveNote,
  notesSummary,
  notesView,
  noteWaiting,
  replyNote,
  withdrawNote,
} from './notes.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };
const scout = { kind: 'agent' as const, name: 'scout' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 13, 13, 0, tick++)).toISOString();

function board(ctx: Context, def: BoardDefinition = creatures()) {
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  return def;
}

function creature(ctx: Context) {
  return createItem(
    ctx,
    {
      collection: 'Criaturas',
      title: 'Tortuga',
      fields: { fdesc: 'Lenta' },
      actor: you,
      channel: 'ui',
    },
    now,
  );
}

function attach(ctx: Context, id: string, filename = 'a.png', module = 'eart') {
  return insertEvidence(ctx.db, {
    itemId: id,
    role: 'after',
    module,
    kind: 'image',
    filename,
    contentType: 'image/png',
    size: 1,
    sha256: 'a'.repeat(64),
    caption: null,
    createdAt: now(),
    actor: kiln,
    channel: 'cli',
  });
}

function refusal(run: () => unknown): OteaError {
  try {
    run();
  } catch (error) {
    if (error instanceof OteaError) return error;
    throw error;
  }
  throw new Error('not refused');
}

// A creature kiln claimed in Concepto, with nothing attached yet.
function working(ctx: Context) {
  board(ctx);
  const item = creature(ctx);
  claimItem(ctx, { id: item.id, actor: kiln }, now);
  return item;
}

describe('a note from the person while an agent works', () => {
  it('records the note with its moment, and moves nothing: step, round and lease stay', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const before = getItem(ctx, item.id);

    const note = leaveNote(
      ctx,
      { id: item.id, text: '¿Y la cola?', actor: you, channel: 'ui' },
      now,
    );

    expect(note).toMatchObject({
      note: 1,
      text: '¿Y la cola?',
      by: 'fede',
      step: 'sconcept',
      stepName: 'Concepto',
      round: 1,
      delivered: { done: 0, of: 1 },
      to: 'kiln',
    });
    const after = getItem(ctx, item.id);
    expect(after.state).toBe(before.state);
    expect(after.lease).toEqual(before.lease);
    expect(selectEvents(ctx.db, item.id).at(-1)).toMatchObject({
      type: 'note_left',
      actor: you,
      data: { note: 1, text: '¿Y la cola?', step: 'sconcept', round: 1, channel: 'ui' },
    });
  });

  it('numbers the notes of an item one after another, several unanswered at once', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    leaveNote(ctx, { id: item.id, text: 'uno', actor: you, channel: 'ui' }, now);
    const second = leaveNote(ctx, { id: item.id, text: 'dos', actor: you, channel: 'ui' }, now);

    expect(second.note).toBe(2);
    expect(notesView(ctx, item.id).notes.map(({ note, answer }) => [note, answer])).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
  });

  it('anchors a note to a line, quoting it, or to a diagram node', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const seen = attach(ctx, item.id, 'pose.png');
    const leave = (anchor: { evidence: number; line?: number; quote?: string; node?: string }) =>
      leaveNote(ctx, { id: item.id, text: 'Ojo', anchor, actor: you, channel: 'ui' }, now);

    expect(
      leave({ evidence: seen, line: 12, quote: '  const port = 3000;  ' }).anchor,
    ).toMatchObject({
      line: 12,
      quote: 'const port = 3000;',
    });
    expect(leave({ evidence: seen, node: ' Scan QR ' }).anchor).toMatchObject({ node: 'Scan QR' });
    expect(leave({ evidence: seen, quote: 'x'.repeat(400), line: 1 }).anchor?.quote).toHaveLength(
      200,
    );
    expect(() => leave({ evidence: seen, line: 0 })).toThrow(/not attached to it|line/);
  });

  it('anchors a note to a point or a zone of an image, in percent, rounded to a tenth', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const seen = attach(ctx, item.id, 'pose.png');
    type Spot = { evidence: number; x?: number; y?: number; w?: number; h?: number };
    const leave = (anchor: Spot) =>
      leaveNote(ctx, { id: item.id, text: 'Aquí', anchor, actor: you, channel: 'ui' }, now);

    expect(leave({ evidence: seen, x: 34.237, y: 61.81 }).anchor).toMatchObject({
      x: 34.2,
      y: 61.8,
    });
    expect(leave({ evidence: seen, x: 20, y: 30, w: 25, h: 30.5 }).anchor).toMatchObject({
      x: 20,
      y: 30,
      w: 25,
      h: 30.5,
    });
    // A point needs both coordinates, inside the image; a zone stays inside it too.
    expect(() => leave({ evidence: seen, x: 10 })).toThrow(/point/);
    expect(() => leave({ evidence: seen, x: 101, y: 5 })).toThrow(/point/);
    expect(() => leave({ evidence: seen, x: 90, y: 5, w: 20, h: 5 })).toThrow(/point/);
    expect(() => leave({ evidence: seen, x: 5, y: 5, w: 0, h: 5 })).toThrow(/point/);
  });

  it('anchors a note to the very file seen: a file attached later in its place leaves it there', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const seen = attach(ctx, item.id, 'pose.png');

    const note = leaveNote(
      ctx,
      {
        id: item.id,
        text: 'La pata',
        anchor: { evidence: seen, seconds: 2.4 },
        actor: you,
        channel: 'ui',
      },
      now,
    );
    attach(ctx, item.id, 'pose.png');

    expect(note.anchor).toEqual({
      evidence: seen,
      filename: 'pose.png',
      part: 'eart',
      partName: 'Arte conceptual',
      seconds: 2.4,
    });
    expect(note.delivered).toEqual({ done: 1, of: 1 });
    expect(notesView(ctx, item.id).notes[0]?.anchor?.evidence).toBe(seen);
  });

  it('refuses a note from an agent: an agent asks the person by handing off', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const error = refusal(() =>
      leaveNote(ctx, { id: item.id, text: 'duda', actor: kiln, channel: 'cli' }, now),
    );
    expect(error.code).toBe('forbidden');
    expect(error.details).toEqual({ kind: 'note', item: item.id, why: 'not_person' });
  });

  it('refuses an empty note, and one on an item nobody does or reviews', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    expect(
      refusal(() => leaveNote(ctx, { id: item.id, text: '  ', actor: you, channel: 'ui' }, now))
        .details,
    ).toEqual({ kind: 'note', item: item.id, why: 'empty' });

    dropItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'no' }, now);
    const error = refusal(() =>
      leaveNote(ctx, { id: item.id, text: 'tarde', actor: you, channel: 'ui' }, now),
    );
    expect(error.code).toBe('invalid_transition');
    expect(error.details).toEqual({ kind: 'note', item: item.id, why: 'not_working' });
  });

  it('anchors a note to a file of an earlier step or round, as the reader lists them', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const early = attach(ctx, item.id, 'captura-1.png');
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'Otra vez' }, now);
    claimItem(ctx, { id: item.id, actor: kiln }, now);
    const leave = (text: string) =>
      leaveNote(
        ctx,
        { id: item.id, text, anchor: { evidence: early, x: 10, y: 20 }, actor: you, channel: 'ui' },
        now,
      );

    expect(leave('En la ronda 1').anchor).toMatchObject({
      evidence: early,
      filename: 'captura-1.png',
    });

    attach(ctx, item.id);
    replyNote(ctx, { id: item.id, note: 1, text: 'Visto', actor: kiln, channel: 'cli' }, now);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli', note: 'Otra' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    claimItem(ctx, { id: item.id, actor: scout }, now);
    expect(leave('De Concepto')).toMatchObject({ step: 'sanimate', anchor: { evidence: early } });
  });

  it('refuses an anchor that is not evidence of the item', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const other = creature(ctx);
    const elsewhere = attach(ctx, other.id);
    const error = refusal(() =>
      leaveNote(
        ctx,
        { id: item.id, text: 'esa', anchor: { evidence: elsewhere }, actor: you, channel: 'ui' },
        now,
      ),
    );
    expect(error.code).toBe('invalid_fields');
    expect(error.details).toEqual({ kind: 'note', item: item.id, why: 'anchor' });
  });
});

describe('the agent and the notes', () => {
  it('cannot hand off while a note is unanswered (exit 8), and can once it answers', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    leaveNote(ctx, { id: item.id, text: '¿Y la cola?', actor: you, channel: 'ui' }, now);

    const error = refusal(() =>
      handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now),
    );
    expect(error.code).toBe('missing_fields');
    expect(error.message).toBe(
      `Not handed off ${item.id}: note 1 from the person is unanswered.\nAnswer it first: otea reply ${item.id} --note 1 "<your short answer>"`,
    );

    const replied = replyNote(
      ctx,
      { id: item.id, note: 1, text: 'Va en la ronda', actor: kiln, channel: 'cli' },
      now,
    );
    expect(replied.text).toBe(
      `Answered note 1 on ${item.id}. Nothing left unanswered: you may hand it off.`,
    );
    expect(replied.note.answer).toMatchObject({ text: 'Va en la ronda', by: 'kiln' });
    expect(handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now).text).toContain(
      'Handed off.',
    );
    expect(selectEvents(ctx.db, item.id).map(({ type }) => type)).toContain('note_answered');
  });

  it('keeps the profile the agent had declared when it answered', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const profile = { harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' };
    saveProfile(ctx.db, 'kiln', profile, { at: now(), channel: 'mcp', confirmed: true });
    leaveNote(ctx, { id: item.id, text: '¿?', actor: you, channel: 'ui' }, now);
    const replied = replyNote(
      ctx,
      { id: item.id, note: 1, text: 'Sí', actor: kiln, channel: 'mcp' },
      now,
    );
    expect(replied.note.answer?.profile).toEqual({
      harness: 'claude-code',
      model: 'claude-opus-5-5',
      effort: 'high',
    });
  });

  it('refuses a reply to no such note, to one already answered, by the person, or by another agent holding it', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    leaveNote(ctx, { id: item.id, text: '¿?', actor: you, channel: 'ui' }, now);
    const reply = (note: number, actor = kiln) =>
      refusal(() => replyNote(ctx, { id: item.id, note, text: 'x', actor, channel: 'cli' }, now));

    expect(reply(4)).toMatchObject({ code: 'not_found', message: `${item.id} has no note 4` });
    expect(reply(1, scout).code).toBe('lease_held');
    expect(reply(1, you as never).code).toBe('forbidden');
    replyNote(ctx, { id: item.id, note: 1, text: 'Sí', actor: kiln, channel: 'cli' }, now);
    expect(reply(1)).toMatchObject({
      code: 'invalid_transition',
      message: `Note 1 on ${item.id} is already answered`,
    });
  });

  it('says what is still unanswered after a reply', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    leaveNote(ctx, { id: item.id, text: 'uno', actor: you, channel: 'ui' }, now);
    leaveNote(ctx, { id: item.id, text: 'dos', actor: you, channel: 'ui' }, now);
    const replied = replyNote(
      ctx,
      { id: item.id, note: 1, text: 'a', actor: kiln, channel: 'cli' },
      now,
    );
    expect(replied.text).toBe(
      `Answered note 1 on ${item.id}. Still unanswered: note 2 (otea reply ${item.id} --note 2 "<your short answer>").`,
    );
    expect(replied.unanswered).toEqual([2]);
  });

  it('gives next the notes in its text and as data, and the Handoff line', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    leaveNote(ctx, { id: item.id, text: '¿Y la cola?', actor: you, channel: 'ui' }, now);

    const answer = nextFor(ctx, 'kiln', {}, now);

    expect(answer.notes?.map(({ note }) => note)).toEqual([1]);
    expect(answer.text).toContain('Notes from the person: 1, 1 unanswered');
    expect(answer.text).toContain('  ✗ Notes from the person answered: required (note 1 is not)');
  });

  it('gives a heartbeat or an attach the unanswered notes, and nothing once answered', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    expect(agentNotes(ctx, item.id)).toBeUndefined();
    leaveNote(ctx, { id: item.id, text: '¿Y la cola?', actor: you, channel: 'ui' }, now);

    const said = agentNotes(ctx, item.id);
    expect(said?.notes.map(({ note }) => note)).toEqual([1]);
    expect(said?.text.split('\n')[0]).toBe('New note from the person (note 1, unanswered):');

    replyNote(ctx, { id: item.id, note: 1, text: 'Sí', actor: kiln, channel: 'cli' }, now);
    expect(agentNotes(ctx, item.id)).toBeUndefined();
  });

  it('wakes the agent holding the item while a note waits for its answer', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    expect(noteWaiting(ctx, 'kiln')).toBeUndefined();
    leaveNote(ctx, { id: item.id, text: '¿?', actor: you, channel: 'ui' }, now);

    expect(noteWaiting(ctx, 'scout')).toBeUndefined();
    expect(noteWaiting(ctx, 'kiln')).toMatchObject({
      item: item.id,
      unanswered: [1],
      text: `${item.id}: new note from the person (note 1). Read it: otea show ${item.id}`,
    });
  });

  it('keeps each round’s notes with it: a later round of the step starts with none', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    leaveNote(ctx, { id: item.id, text: '¿?', actor: you, channel: 'ui' }, now);
    replyNote(ctx, { id: item.id, note: 1, text: 'Sí', actor: kiln, channel: 'cli' }, now);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'Otra vez' }, now);

    expect(notesView(ctx, item.id).notes).toHaveLength(1);
    expect(notesView(ctx, item.id, { round: 2 }).notes).toEqual([]);
    expect(notesView(ctx, item.id, { step: 'Concepto', round: 1 }).notes).toHaveLength(1);
    expect(notesSummary(ctx, getItem(ctx, item.id))).toBeUndefined();
  });
});

describe('comments the person leaves while reviewing', () => {
  it('go with a send-back as notes of the round it starts, which the agent answers', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const seen = attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);

    const comment = leaveNote(
      ctx,
      {
        id: item.id,
        text: 'La cola es corta',
        anchor: { evidence: seen, x: 10, y: 20 },
        actor: you,
        channel: 'ui',
      },
      now,
    );
    expect(comment).toMatchObject({ round: 1, review: { for: { step: 'sconcept', round: 2 } } });
    // Nothing reaches the agent while you review.
    expect(noteWaiting(ctx, 'kiln')).toBeUndefined();

    sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'Otra vez' }, now);
    claimItem(ctx, { id: item.id, actor: kiln }, now);
    expect(agentNotes(ctx, item.id)?.notes.map(({ note }) => note)).toEqual([1]);
    expect(notesView(ctx, item.id, { round: 2 }).notes.map(({ note }) => note)).toEqual([1]);
    attach(ctx, item.id);
    expect(() => handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now)).toThrow();
    replyNote(ctx, { id: item.id, note: 1, text: 'Alargada', actor: kiln, channel: 'cli' }, now);
    const handed = { id: item.id, actor: kiln, channel: 'cli' as const, note: 'Alargué la cola' };
    expect(handoffItem(ctx, handed, now).item.state).toBe('sconcept__review');
  });

  it('stay notes of the round reviewed when the person approves, and nobody has to answer them', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    leaveNote(ctx, { id: item.id, text: 'Me gusta', actor: you, channel: 'ui' }, now);

    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);

    expect(notesView(ctx, item.id, { step: 'Concepto', round: 1 }).notes).toHaveLength(1);
    expect(noteWaiting(ctx, 'kiln')).toBeUndefined();
    expect(agentNotes(ctx, item.id)).toBeUndefined();
  });

  it('can be changed or taken back while the review is open, never once they went (P5-3)', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const seen = attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    const on = { evidence: seen, x: 10, y: 20, w: 30, h: 15 };
    leaveNote(ctx, { id: item.id, text: 'La hoja', anchor: on, actor: you, channel: 'ui' }, now);
    leaveNote(ctx, { id: item.id, text: 'El color', actor: you, channel: 'ui' }, now);

    const changed = editNote(
      ctx,
      { id: item.id, note: 1, text: 'La hoja, más fina', actor: you, channel: 'ui' },
      now,
    );
    expect(changed).toMatchObject({ text: 'La hoja, más fina', anchor: { x: 10, w: 30 } });
    withdrawNote(ctx, { id: item.id, note: 2, actor: you, channel: 'ui' }, now);
    expect(notesView(ctx, item.id).notes.map(({ note, text }) => [note, text])).toEqual([
      [1, 'La hoja, más fina'],
    ]);
    expect(() =>
      editNote(ctx, { id: item.id, note: 1, text: 'x', actor: kiln, channel: 'cli' }, now),
    ).toThrow(/only the person/);

    sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'Otra vez' }, now);
    expect(
      refusal(() => withdrawNote(ctx, { id: item.id, note: 1, actor: you, channel: 'ui' }, now))
        .message,
    ).toMatch(/already went/);
    expect(
      refusal(() =>
        editNote(ctx, { id: item.id, note: 1, text: 'y', actor: you, channel: 'ui' }, now),
      ).message,
    ).toMatch(/already went/);
  });

  it('let a send-back go with no words of its own: the comments are what to change (P4-7)', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const seen = attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    expect(
      refusal(() => sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now)).code,
    ).toBe('reason_required');
    leaveNote(
      ctx,
      {
        id: item.id,
        text: 'La cola',
        anchor: { evidence: seen, x: 1, y: 2 },
        actor: you,
        channel: 'ui',
      },
      now,
    );

    const back = sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);

    expect(back.item.state).toBe('sconcept');
    claimItem(ctx, { id: item.id, actor: kiln }, now);
    expect(agentNotes(ctx, item.id)?.notes.map(({ text }) => text)).toEqual(['La cola']);
  });

  it("let the page's Devolver go with the comments alone, and never a close (P4-7)", () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    const back = { id: item.id, to: 'sconcept', actor: you, channel: 'ui' as const };
    expect(refusal(() => moveItem(ctx, back, now)).code).toBe('reason_required');
    leaveNote(ctx, { id: item.id, text: 'La cola', actor: you, channel: 'ui' }, now);

    expect(moveItem(ctx, back, now).state).toBe('sconcept');
  });

  it('are refused from an agent, and on a step an agent reviews', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    expect(() =>
      leaveNote(ctx, { id: item.id, text: 'x', actor: kiln, channel: 'cli' }, now),
    ).toThrow(/only the person/);
  });
});

describe('what the page reads of the notes', () => {
  it('lists the thread with the agent at work and when it last gave a sign of life', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    upsertAgent(ctx.db, {
      name: 'kiln',
      harness: null,
      harnessVersion: null,
      lastSeen: '2026-11-13T12:50:00.000Z',
    });
    leaveNote(ctx, { id: item.id, text: '¿?', actor: you, channel: 'ui' }, now);

    expect(notesView(ctx, item.id, {}, now).worker).toEqual({
      name: 'kiln',
      lastSeen: '2026-11-13T12:50:00.000Z',
      holds: true,
    });
    expect(showItem(ctx, item.id, { actor: you, channel: 'ui' }).board?.thread).toHaveLength(1);
  });

  it('marks in a list that the agent replied, without changing whose turn it is', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    leaveNote(ctx, { id: item.id, text: 'uno', actor: you, channel: 'ui' }, now);
    leaveNote(ctx, { id: item.id, text: 'dos', actor: you, channel: 'ui' }, now);
    expect(notesSummary(ctx, getItem(ctx, item.id))).toEqual({ count: 2, unanswered: 2 });

    replyNote(ctx, { id: item.id, note: 2, text: 'b', actor: kiln, channel: 'cli' }, now);

    const summary = notesSummary(ctx, getItem(ctx, item.id));
    expect(summary).toMatchObject({ count: 2, unanswered: 1, replied: { note: 2, by: 'kiln' } });
    expect(getItem(ctx, item.id).turn).toBe('agent');
  });
});
