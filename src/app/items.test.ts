import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import { addCollection } from './collections.ts';
import { createItem, getItem, listItems, moveItem } from './items.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const bot: Actor = { kind: 'agent', name: 'claude' };

function clock(...times: string[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)] ?? '';
}

describe('items', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    addCollection(db, { name: 'tasks' });
  });

  afterEach(() => db.close());

  describe('createItem', () => {
    it('creates an item in the initial state with a sequential id', () => {
      const now = clock('2026-01-01T00:00:00.000Z');

      const first = createItem(db, { collection: 'tasks', title: 'First', actor: ana }, now);
      const second = createItem(
        db,
        { collection: 'tasks', title: 'Second', body: 'Details', actor: bot },
        now,
      );

      expect(first).toEqual({
        id: 'TASKS-1',
        collection: 'tasks',
        seq: 1,
        title: 'First',
        body: '',
        state: 'todo',
        turn: 'agent',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: ana,
      });
      expect(second).toMatchObject({ id: 'TASKS-2', seq: 2, body: 'Details', createdBy: bot });
    });

    it('records a created event in the same write', () => {
      const now = clock('2026-01-01T00:00:00.000Z');
      createItem(db, { collection: 'tasks', title: 'First', actor: ana }, now);

      expect(getItem(db, 'TASKS-1').events).toEqual([
        {
          id: 1,
          itemId: 'TASKS-1',
          type: 'created',
          actor: ana,
          at: '2026-01-01T00:00:00.000Z',
          data: { state: 'todo' },
        },
      ]);
    });

    it('fails with not_found for an unknown collection', () => {
      const create = () => createItem(db, { collection: 'nope', title: 'X', actor: ana });

      expect(create).toThrow(expect.objectContaining({ code: 'not_found' }));
    });
  });

  describe('moveItem', () => {
    beforeEach(() => {
      createItem(db, { collection: 'tasks', title: 'First', actor: ana }, clock('t0'));
    });

    it('moves the item and appends a transitioned event', () => {
      const moved = moveItem(db, { id: 'TASKS-1', to: 'in_progress', actor: bot }, clock('t1'));

      expect(moved).toMatchObject({ state: 'in_progress', turn: 'agent', updatedAt: 't1' });
      expect(moved.createdAt).toBe('t0');
      expect(
        getItem(db, 'TASKS-1').events.map(({ type, actor, at, data }) => ({
          type,
          actor,
          at,
          data,
        })),
      ).toEqual([
        { type: 'created', actor: ana, at: 't0', data: { state: 'todo' } },
        { type: 'transitioned', actor: bot, at: 't1', data: { from: 'todo', to: 'in_progress' } },
      ]);
    });

    it('rejects an invalid transition without writing anything', () => {
      const move = () => moveItem(db, { id: 'TASKS-1', to: 'done', actor: bot }, clock('t1'));

      expect(move).toThrow(expect.objectContaining({ code: 'invalid_transition' }));
      expect(getItem(db, 'TASKS-1')).toMatchObject({ state: 'todo', updatedAt: 't0' });
      expect(getItem(db, 'TASKS-1').events).toHaveLength(1);
    });

    it('fails with not_found for an unknown item', () => {
      const move = () => moveItem(db, { id: 'TASKS-9', to: 'in_progress', actor: bot });

      expect(move).toThrow(expect.objectContaining({ code: 'not_found' }));
    });
  });

  describe('getItem', () => {
    it('fails with not_found for an unknown id', () => {
      expect(() => getItem(db, 'TASKS-9')).toThrow(expect.objectContaining({ code: 'not_found' }));
    });

    it('does not change the item when read', () => {
      createItem(db, { collection: 'tasks', title: 'First', actor: ana }, clock('t0'));
      const before = getItem(db, 'TASKS-1');

      expect(getItem(db, 'TASKS-1')).toEqual(before);
    });
  });

  describe('listItems', () => {
    beforeEach(() => {
      addCollection(db, {
        name: 'reviews',
        workflow: {
          name: 'reviews',
          initial: 'open',
          states: [
            { name: 'open', turn: 'human' },
            { name: 'closed', turn: 'none' },
          ],
          transitions: [{ from: 'open', to: 'closed', by: 'agent', reasonRequired: false }],
        },
      });
      const now = clock('t0');
      createItem(db, { collection: 'tasks', title: 'A', actor: ana }, now);
      createItem(db, { collection: 'reviews', title: 'B', actor: bot }, now);
      createItem(db, { collection: 'tasks', title: 'C', actor: ana }, now);
      moveItem(db, { id: 'TASKS-2', to: 'in_progress', actor: bot }, now);
    });

    const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

    it('lists every item in creation order', () => {
      expect(ids(listItems(db))).toEqual(['TASKS-1', 'REVIEWS-1', 'TASKS-2']);
    });

    it('filters by collection', () => {
      expect(ids(listItems(db, { collection: 'tasks' }))).toEqual(['TASKS-1', 'TASKS-2']);
    });

    it('filters by state', () => {
      expect(ids(listItems(db, { state: 'in_progress' }))).toEqual(['TASKS-2']);
    });

    it('filters by derived turn', () => {
      expect(ids(listItems(db, { turn: 'human' }))).toEqual(['REVIEWS-1']);
      expect(ids(listItems(db, { turn: 'agent' }))).toEqual(['TASKS-1', 'TASKS-2']);
    });

    it('combines filters', () => {
      expect(ids(listItems(db, { collection: 'tasks', state: 'todo', turn: 'agent' }))).toEqual([
        'TASKS-1',
      ]);
    });
  });
});
