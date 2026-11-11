import { describe, expect, it } from 'vitest';
import type { ItemEvent } from './types.ts';
import { dropUndone } from './undone.ts';

const ev = (id: number, data: Record<string, unknown>): ItemEvent => ({
  id,
  type: 'transitioned',
  actor: { kind: 'human', name: 'human' },
  at: '2026-11-11T12:00:00Z',
  data,
});

describe('dropUndone', () => {
  it('drops a move you took back together with its undo', () => {
    const events = [
      ev(1, { from: 'todo', to: 'review' }),
      ev(2, { from: 'review', to: 'done' }),
      ev(3, { from: 'done', to: 'review', undoes: 2 }),
    ];
    expect(dropUndone(events).map((e) => e.id)).toEqual([1]);
  });

  it('keeps the list as it is when nothing was undone', () => {
    const events = [ev(1, { from: 'todo', to: 'review' })];
    expect(dropUndone(events)).toBe(events);
  });
});
