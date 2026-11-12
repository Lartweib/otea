import { describe, expect, it } from 'vitest';
import { creatures } from '../../../../src/core/board/testing.ts';
import type { ItemEvent } from '../../types.ts';
import { boardItemOf } from './board-item.ts';

const words = { done: 'Hecho', dip: (n: number) => `ronda ${n}` };
const agent = (name: string) => ({ kind: 'agent' as const, name });
const you = { kind: 'human' as const, name: 'tú' };
let id = 0;
const created = (state: string, at = '2026-01-01T00:00:00Z'): ItemEvent => ({
  id: ++id,
  type: 'created',
  actor: you,
  at,
  data: { state },
});
const moved = (from: string, to: string, by: ItemEvent['actor'], at: string): ItemEvent => ({
  id: ++id,
  type: 'transitioned',
  actor: by,
  at,
  data: { from, to },
});
const item = (state: string, events: ItemEvent[]) => ({
  state,
  createdAt: '2026-01-01T00:00:00Z',
  events,
});

describe('boardItemOf: the item page reads a published board through the step engine', () => {
  it('names the step’s own agent, not the last agent that moved the item', () => {
    const events = [
      created('sconcept'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-02T00:00:00Z'),
      moved('sconcept__review', 'sanimate', you, '2026-01-03T00:00:00Z'),
    ];
    const on = boardItemOf(creatures(), item('sanimate', events), words);

    expect(on?.agent).toBe('kiln');
    expect(on?.round).toBe(1);
  });

  it('says no agent for a step any agent may take, and the reviewer during an agent review', () => {
    expect(boardItemOf(creatures(), item('sconcept', [created('sconcept')]), words)?.agent).toBe(
      null,
    );
    expect(
      boardItemOf(creatures(), item('sanimate__review', [created('sconcept')]), words)?.agent,
    ).toBe('scout');
  });

  it('counts the round per step and draws the send-back where it came from', () => {
    const events = [
      created('sconcept'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-02T00:00:00Z'),
      moved('sconcept__review', 'sconcept', you, '2026-01-03T00:00:00Z'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-04T00:00:00Z'),
      moved('sconcept__review', 'sanimate', you, '2026-01-05T00:00:00Z'),
    ];
    const atConcept = boardItemOf(creatures(), item('sconcept__review', events.slice(0, 4)), words);
    expect(atConcept?.round).toBe(2);
    expect(atConcept?.route.dips).toEqual([{ at: 1, label: 'ronda 1' }]);

    const atAnimate = boardItemOf(creatures(), item('sanimate', events), words);
    expect(atAnimate?.round).toBe(1);
    // The route's stops are the steps and the reviews on the other lane, never «· revisión» columns.
    expect(atAnimate?.route.words).toEqual(['Concepto', '', 'Animar', 'Pulir', 'Hecho']);
  });

  it('draws a closed item at Hecho, and leaves a state the board does not know to the preset', () => {
    expect(boardItemOf(creatures(), item('done', [created('sconcept')]), words)?.route.ci).toBe(4);
    expect(boardItemOf(creatures(), item('fixing', [created('fixing')]), words)).toBeNull();
  });
});
