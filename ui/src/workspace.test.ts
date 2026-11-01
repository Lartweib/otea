import { describe, expect, it } from 'vitest';
import type { Item, Turn } from './types.ts';
import { inCollection, railEntries } from './workspace.ts';

const item = (id: string, collection: string, turn: Turn, updatedAt = '2026-01-01T00:00:00Z') =>
  ({ id, collection, turn, updatedAt, title: id, state: 's' }) as Item;

const items = [
  item('TASKS-1', 'tasks', 'human'),
  item('TASKS-2', 'tasks', 'agent'),
  item('TASKS-3', 'tasks', 'none'),
  item('NOTES-1', 'notes', 'human'),
];

describe('railEntries', () => {
  it('counts what waits for you and what is still open in every collection, in the given order', () => {
    expect(railEntries(['tasks', 'notes', 'empty'], items)).toEqual([
      { name: 'tasks', yours: 1, open: 2 },
      { name: 'notes', yours: 1, open: 1 },
      { name: 'empty', yours: 0, open: 0 },
    ]);
  });
});

describe('inCollection', () => {
  it('keeps every item without a collection filter', () => {
    expect(inCollection(items, undefined)).toEqual(items);
  });

  it('keeps only the items of the chosen collection', () => {
    expect(inCollection(items, 'notes').map((each) => each.id)).toEqual(['NOTES-1']);
  });
});
