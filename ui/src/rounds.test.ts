import { describe, expect, it } from 'vitest';
import { creatures } from '../../src/core/board/testing.ts';
import { optionsSummary, parseOptions } from './options.ts';
import { roundFiles, roundsOf } from './rounds.ts';
import type { Evidence, ItemEvent, State } from './types.ts';

const agent = { kind: 'agent' as const, name: 'claude-b' };
const you = { kind: 'human' as const, name: 'human' };
const STATES: State[] = [
  { name: 'queued', turn: 'agent' },
  { name: 'in_progress', turn: 'agent' },
  { name: 'review', turn: 'human' },
  { name: 'approved', turn: 'none', closes: 'done' },
  { name: 'dropped', turn: 'none', closes: 'discarded' },
];

let ids = 0;
const moved = (at: string, actor: ItemEvent['actor'], from: string, to: string, extra = {}) => ({
  id: ++ids,
  type: 'transitioned',
  actor,
  at: `2026-11-02T${at}:00.000Z`,
  data: { from, to, ...extra },
});
const file = (id: number, at: string, filename: string, module = 'recording'): Evidence => ({
  id,
  itemId: 'CREA-7',
  role: 'single',
  module,
  kind: 'video',
  filename,
  contentType: 'video/mp4',
  size: 10,
  sha256: 'x',
  caption: null,
  createdAt: `2026-11-02T${at}:00.000Z`,
  actor: agent,
  channel: 'cli',
});

describe('rounds', () => {
  const events: ItemEvent[] = [
    {
      id: ++ids,
      type: 'created',
      actor: you,
      at: '2026-11-02T08:12:00.000Z',
      data: { state: 'queued' },
    },
    moved('08:30', agent, 'queued', 'in_progress'),
    moved('09:20', agent, 'in_progress', 'review', { reason: 'First pass: 6 frames' }),
    moved('10:02', you, 'review', 'in_progress', { reason: 'Too frantic', channel: 'ui' }),
    moved('11:05', agent, 'in_progress', 'review', { reason: 'Wings at 5 frames' }),
    moved('12:10', you, 'review', 'in_progress', {
      reason: 'Let the body trail',
      via: 'claude-b',
      quote: 'trail it',
    }),
    moved('13:30', agent, 'in_progress', 'review', { reason: 'Body lags the wings' }),
  ];
  const evidence = [
    file(1, '09:00', 'idle_r1.mp4'),
    file(2, '10:50', 'idle_r2.mp4'),
    file(3, '13:29', 'idle_r3.mp4'),
    file(4, '13:29', 'bestiary.md', 'images'),
  ];

  it('reads one round per agent move into review, its note, files and verdict', () => {
    const rounds = roundsOf(events, evidence, STATES);

    expect(rounds.map(({ n, note }) => [n, note])).toEqual([
      [1, 'First pass: 6 frames'],
      [2, 'Wings at 5 frames'],
      [3, 'Body lags the wings'],
    ]);
    expect(rounds.map(({ evidence: files }) => files.map(({ id }) => id))).toEqual([
      [1],
      [2],
      [3, 4],
    ]);
    expect(rounds[0]?.verdict).toMatchObject({ kind: 'sent-back', reason: 'Too frantic' });
    expect(rounds[1]?.verdict).toMatchObject({ kind: 'sent-back', relayedBy: 'claude-b' });
    expect(rounds[2]?.verdict).toBeUndefined();
    expect(roundFiles(rounds[2], 'recording').map(({ id }) => id)).toEqual([3]);
  });

  it('ends the rounds with a closing verdict', () => {
    const closed = [...events, moved('14:00', you, 'review', 'approved', { channel: 'ui' })];
    expect(roundsOf(closed, evidence, STATES)[2]?.verdict).toMatchObject({
      kind: 'closed',
      to: 'approved',
      closes: 'done',
    });
  });

  it('has no rounds before the agent first hands it over', () => {
    expect(roundsOf(events.slice(0, 2), evidence, STATES)).toEqual([]);
  });
});

describe('rounds on a board', () => {
  // Criaturas: Concepto (any agent, you review), Animar (kiln, scout reviews), Pulir (you).
  const def = creatures();
  const BOARD: State[] = [
    { name: 'sconcept', turn: 'agent' },
    { name: 'sconcept__review', turn: 'human' },
    { name: 'sanimate', turn: 'agent' },
    { name: 'sanimate__review', turn: 'agent' },
    { name: 'spolish', turn: 'human' },
    { name: 'done', turn: 'none', closes: 'done' },
    { name: 'dropped', turn: 'none', closes: 'discarded' },
  ];
  const pinta = { kind: 'agent' as const, name: 'pinta' };
  const created: ItemEvent = {
    id: ++ids,
    type: 'created',
    actor: you,
    at: '2026-11-02T08:00:00.000Z',
    data: { state: 'sconcept' },
  };
  const handed = moved('09:00', pinta, 'sconcept', 'sconcept__review', { note: 'Dos bocetos' });
  const back = moved('10:00', you, 'sconcept__review', 'sconcept', { reason: 'Más barro' });
  const again = moved('11:00', pinta, 'sconcept', 'sconcept__review', { note: 'Con barro' });
  const approved = moved('12:00', you, 'sconcept__review', 'sanimate', { channel: 'ui' });
  const story = [created, handed, back, again, approved];

  it('reads each handoff’s note, and an approval as approved, never as sent back', () => {
    const rounds = roundsOf(story, [], BOARD, { def, step: 'sconcept' });
    expect(rounds.map(({ n, note, verdict }) => [n, note, verdict?.kind])).toEqual([
      [1, 'Dos bocetos', 'sent-back'],
      [2, 'Con barro', 'approved'],
    ]);
  });

  it('counts by step as the engine does: the next step starts with no rounds of its own', () => {
    expect(roundsOf(story, [], BOARD, { def, step: 'sanimate' })).toEqual([]);
  });

  it('drops an approval taken back with Deshacer', () => {
    const undo = moved('12:00', you, 'sanimate', 'sconcept__review', { undoes: approved.id });
    const twice = moved('12:01', you, 'sconcept__review', 'sanimate', { channel: 'ui' });
    const rounds = roundsOf([...story, undo, twice], [], BOARD, { def, step: 'sconcept' });
    expect(rounds.map(({ n, verdict }) => [n, verdict?.kind, verdict?.at])).toEqual([
      [1, 'sent-back', back.at],
      [2, 'approved', twice.at],
    ]);
  });

  it('keeps the last step’s rounds once the item is closed', () => {
    const done = moved('13:00', you, 'sconcept__review', 'done', { channel: 'ui' });
    const rounds = roundsOf([created, handed, done], [], BOARD, { def });
    expect(rounds.map(({ n, verdict }) => [n, verdict?.kind])).toEqual([[1, 'closed']]);
  });
});

describe('options', () => {
  const text = `### A · Hard switch at midnight
New key at 00:00; old tokens stop verifying.
+ one key at a time
- logs out every signed-in user

### B · Overlap window (recommended)
Verify with the current and the previous key for 48 h.
+ nobody is logged out
- two keys live for 48 h`;

  it('reads each option with its gains, costs and the recommended one', () => {
    const options = parseOptions(text);
    expect(options).toEqual([
      {
        letter: 'A',
        name: 'Hard switch at midnight',
        summary: 'New key at 00:00; old tokens stop verifying.',
        gains: ['one key at a time'],
        costs: ['logs out every signed-in user'],
        recommended: false,
      },
      {
        letter: 'B',
        name: 'Overlap window',
        summary: 'Verify with the current and the previous key for 48 h.',
        gains: ['nobody is logged out'],
        costs: ['two keys live for 48 h'],
        recommended: true,
      },
    ]);
    expect(optionsSummary(options)).toEqual({ count: 2, recommended: 'B' });
  });

  it('finds no options in text without headings', () => {
    expect(parseOptions('We could do A or B.')).toEqual([]);
  });
});
