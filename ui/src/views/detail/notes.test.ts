import { afterEach, describe, expect, it } from 'vitest';
import type { ItemNote } from '../../../../src/core/board/notes.ts';
import { ago, NOW } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import {
  anchorPieces,
  noteContext,
  notedOn,
  notesCount,
  profileWords,
  quietMinutes,
  roundNotesOf,
  threadOf,
} from './notes.ts';

afterEach(() => setLanguage('en'));

const note = (n: number, o: Partial<ItemNote> = {}): ItemNote => ({
  note: n,
  text: `note ${n}`,
  at: ago(30 - n),
  by: 'fede',
  step: 'sdo',
  stepName: 'Hacerlo',
  round: 2,
  delivered: { done: n, of: 4 },
  to: 'claude-d',
  ...o,
});

const answered = (n: number, o: Partial<ItemNote> = {}) =>
  note(n, { answer: { text: `answer ${n}`, at: ago(20 - n), by: 'claude-d' }, ...o });

const evidence = (id: number, o: Partial<Evidence> = {}): Evidence => ({
  id,
  itemId: 'TAR-7',
  role: 'single',
  module: 'shots',
  kind: 'image',
  filename: `shot-${id}.png`,
  contentType: 'image/png',
  size: 10,
  sha256: '',
  caption: null,
  createdAt: ago(60 - id),
  actor: { kind: 'agent', name: 'claude-d' },
  channel: 'cli',
  ...o,
});

describe('the thread the page reads', () => {
  it('takes the board block’s thread, else reads the events', () => {
    const thread = [note(1)];
    expect(threadOf({ thread }, [])).toBe(thread);
    const events = [
      {
        id: 1,
        type: 'note_left',
        actor: { kind: 'human' as const, name: 'fede' },
        at: ago(5),
        data: { note: 1, text: 'hola', step: 'sdo', stepName: 'Hacerlo', round: 1 },
      },
      {
        id: 2,
        type: 'note_answered',
        actor: { kind: 'agent' as const, name: 'claude-d' },
        at: ago(4),
        data: { note: 1, text: 'visto' },
      },
    ];
    const read = threadOf(undefined, events);
    expect(read).toHaveLength(1);
    expect(read[0]?.answer?.text).toBe('visto');
  });

  it('keeps a round’s notes, in order', () => {
    const thread = [note(1, { round: 1 }), note(2), note(3, { step: 'sother' }), note(4)];
    expect(roundNotesOf(thread, 'sdo', 2).map(({ note: n }) => n)).toEqual([2, 4]);
  });

  it('counts the notes and those waiting for an answer', () => {
    expect(notesCount([answered(1), note(2), note(3)])).toEqual({ count: 3, unanswered: 2 });
    expect(notesCount([])).toEqual({ count: 0, unanswered: 0 });
  });
});

describe('the moment a note was left in', () => {
  it('says the step, the round, the time and the deliverables that were in', () => {
    setLanguage('es');
    const line = noteContext(note(2), NOW);
    expect(line).toMatch(/^Hacerlo · ronda 2 · \d\d:\d\d · llevaba 2 de 4 entregables$/);
    setLanguage('en');
    expect(noteContext(note(1), NOW)).toMatch(
      /^Hacerlo · round 2 · \d\d:\d\d · it had 1 of 4 deliverables$/,
    );
  });

  it('leaves the deliverables out when the step asks for none', () => {
    setLanguage('es');
    expect(noteContext(note(1, { delivered: { done: 0, of: 0 } }), NOW)).toMatch(
      /^Hacerlo · ronda 2 · \d\d:\d\d$/,
    );
  });
});

describe('the agent’s profile, as a thread says it', () => {
  it('names the model’s family and the effort', () => {
    expect(profileWords({ harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' })).toBe(
      'opus · high',
    );
    expect(profileWords(undefined)).toBeNull();
  });
});

describe('a note to an agent that gives no sign of life', () => {
  it('is quiet past five minutes without a sign, never before', () => {
    expect(quietMinutes({ name: 'claude-d', lastSeen: ago(12), holds: true }, NOW)).toBe(12);
    expect(quietMinutes({ name: 'claude-d', lastSeen: ago(2), holds: true }, NOW)).toBeNull();
    expect(quietMinutes({ name: 'claude-d', lastSeen: null, holds: false }, NOW)).toBeNull();
    expect(quietMinutes(undefined, NOW)).toBeNull();
  });
});

describe('the pieces a note can be on', () => {
  it('lists what was attached in this round, newest first', () => {
    const all = [evidence(1, { createdAt: ago(90) }), evidence(2), evidence(3)];
    expect(anchorPieces(all, ago(70)).map(({ id }) => id)).toEqual([3, 2]);
    expect(anchorPieces(all, undefined).map(({ id }) => id)).toEqual([3, 2, 1]);
  });

  it('counts the notes on each piece, by the very file seen', () => {
    const thread = [
      note(1, { anchor: { evidence: 5, filename: 'a.gif' } }),
      note(2, { anchor: { evidence: 5, filename: 'a.gif' } }),
      note(3, { anchor: { evidence: 6, filename: 'b.diff' } }),
      note(4),
    ];
    const on = notedOn(thread);
    expect(on.get(5)).toBe(2);
    expect(on.get(6)).toBe(1);
    expect(on.size).toBe(2);
  });
});
