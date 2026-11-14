import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../core/board/model.ts';
import type { EventRecord } from '../store/queries.ts';
import { eventData, readableEvent } from './names.ts';

// Events written before a step's name was kept with them carry only its id: they read by the
// board's step of that id, and a step removed since is said as such, never as a bare id.

const def = {
  steps: [
    { id: 'sdraw', name: 'Draw' },
    { id: 'sink', name: 'Ink' },
  ],
} as unknown as BoardDefinition;

const moved = (data: Record<string, unknown>): EventRecord => ({
  id: 1,
  itemId: 'ART-1',
  type: 'transitioned',
  actor: { kind: 'agent', name: 'kiln' },
  at: '2026-01-01T00:00:00.000Z',
  data,
});

describe('a step an old event names only by id', () => {
  it('reads by the board’s step of that id', () => {
    expect(readableEvent(def, moved({ from: 'sdraw', to: 'sink' })).data).toMatchObject({
      from: 'Draw',
      to: 'Ink',
    });
  });

  it('says a step since removed, keeping its id in the --json data', () => {
    expect(readableEvent(def, moved({ from: 'sgone', to: 'sink' })).data.from).toBe(
      'a removed step',
    );
    expect(eventData(def, moved({ from: 'sgone', to: 'sink' })).data).toMatchObject({
      from: 'sgone',
      fromName: 'a removed step',
    });
  });

  it('still prefers the name the event kept', () => {
    expect(
      readableEvent(def, moved({ from: 'sgone', fromName: 'Sketch', to: 'sink' })).data.from,
    ).toBe('Sketch');
  });
});
