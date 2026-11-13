import { describe, expect, it } from 'vitest';
import type { Actor } from '../item.ts';
import { roundsOf } from './engine.ts';
import {
  type HistoryEvent,
  handoffNotes,
  historyOf,
  roundsOfStep,
  withoutUndone,
} from './history.ts';
import { creatures } from './testing.ts';

const quill: Actor = { kind: 'agent', name: 'quill' };
const you: Actor = { kind: 'human', name: 'fede' };
const start = { initial: 'sconcept', createdAt: '2026-01-01T00:00:00Z' };

let id = 0;
const event = (
  type: string,
  data: Record<string, unknown>,
  actor = quill,
  at = `2026-01-01T00:00:${String(++id).padStart(2, '0')}Z`,
): HistoryEvent => ({ id, type, actor, at, data });
const move = (from: string, to: string, actor = quill, more: Record<string, unknown> = {}) =>
  event('transitioned', { from, to, ...more }, actor);

describe('withoutUndone: a move taken back never happened', () => {
  it('drops the undo and the move it names, keeping the rest in order', () => {
    const a = move('sconcept', 'sconcept__review');
    const b = move('sconcept__review', 'sanimate', you);
    const undo = move('sanimate', 'sconcept__review', you, { undoes: b.id });
    const c = move('sconcept__review', 'sanimate', you);
    expect(withoutUndone([a, b, undo, c])).toEqual([a, c]);
  });

  it('keeps the list as it is when nothing was undone', () => {
    const events = [move('sconcept', 'sconcept__review')];
    expect(withoutUndone(events)).toBe(events);
  });
});

describe('historyOf: the moves the engine replays', () => {
  it('counts an approval taken back and given again as one round of the next step', () => {
    const def = creatures();
    const handed = move('sconcept', 'sconcept__review', quill, { note: 'Listo' });
    const approved = move('sconcept__review', 'sanimate', you);
    const events = [
      event('created', { state: 'sconcept' }),
      handed,
      approved,
      move('sanimate', 'sconcept__review', you, { undoes: approved.id }),
      move('sconcept__review', 'sanimate', you),
    ];
    const history = historyOf(events, start);
    expect(history.moves.map(({ to }) => to)).toEqual(['sconcept__review', 'sanimate']);
    const { rounds } = roundsOf(def, history.initial, history.createdAt, history.moves);
    expect(rounds).toEqual({ sconcept: 1, sanimate: 1 });
  });

  it('keeps each handoff note with the round it closed', () => {
    const def = creatures();
    const events = [
      event('created', { state: 'sconcept' }),
      move('sconcept', 'sconcept__review', quill, { note: 'Primera' }),
      move('sconcept__review', 'sconcept', you, { reason: 'Más barro' }),
      move('sconcept', 'sconcept__review', quill, { note: 'Con barro' }),
    ];
    const notes = handoffNotes(def, historyOf(events, start));
    expect(notes.map(({ round, note, by }) => [round, note, by.name])).toEqual([
      [1, 'Primera', 'quill'],
      [2, 'Con barro', 'quill'],
    ]);
  });
});

describe('roundsOfStep: the rounds of one step', () => {
  it('numbers them as the engine does and keeps what a send-back said', () => {
    const def = creatures();
    const back = move('sconcept__review', 'sconcept', you, { reason: 'Más barro' });
    const events = [
      event('created', { state: 'sconcept' }),
      move('sconcept', 'sconcept__review', quill, { note: 'Primera' }),
      back,
      move('sconcept', 'sconcept__review', quill, { note: 'Con barro' }),
      move('sconcept__review', 'sanimate', you),
    ];
    const history = historyOf(events, start);
    expect(roundsOfStep(def, history, 'sconcept')).toEqual([
      { round: 1, at: '2026-01-01T00:00:00Z' },
      {
        round: 2,
        at: back.at,
        back: { said: { by: you, text: 'Más barro' }, at: back.at },
      },
    ]);
    // Moving on starts the next step's first round with nothing sent back.
    expect(roundsOfStep(def, history, 'sanimate')).toEqual([{ round: 1, at: events[4]?.at }]);
  });

  it('leaves out a send-back the person took back', () => {
    const def = creatures();
    const back = move('sconcept__review', 'sconcept', you, { reason: 'Más barro' });
    const events = [
      event('created', { state: 'sconcept' }),
      move('sconcept', 'sconcept__review', quill, { note: 'Primera' }),
      back,
      move('sconcept', 'sconcept__review', you, { undoes: back.id }),
    ];
    expect(roundsOfStep(def, historyOf(events, start), 'sconcept')).toEqual([
      { round: 1, at: '2026-01-01T00:00:00Z' },
    ]);
  });
});
