import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, listItems, moveItem, showItem } from './items.ts';
import { memoryContext, REVIEWS } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const bot: Actor = { kind: 'agent', name: 'claude' };

const task = (title: string, actor = ana) => ({
  collection: 'tasks',
  title,
  fields: { description: 'Details' },
  actor,
});

function clock(...times: string[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)] ?? '';
}

describe('items', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
    addCollection(ctx, { name: 'tasks' });
  });

  afterEach(() => ctx.db.close());

  describe('createItem', () => {
    it('creates a complete item in the initial state with a sequential id', () => {
      const now = clock('2026-01-01T00:00:00.000Z');

      const first = createItem(ctx, task('First'), now);
      const second = createItem(ctx, task('Second', bot), now);

      expect(first).toEqual({
        id: 'TASKS-1',
        collection: 'tasks',
        seq: 1,
        title: 'First',
        fields: { description: 'Details', priority: 'medium' },
        presetVersion: 1,
        state: 'todo',
        turn: 'agent',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: ana,
      });
      expect(second).toMatchObject({ id: 'TASKS-2', seq: 2, createdBy: bot });
    });

    it('starts an item without its description in the incomplete state', () => {
      const item = createItem(ctx, { collection: 'tasks', title: 'Vague', actor: ana });

      expect(item).toMatchObject({
        state: 'incomplete',
        turn: 'agent',
        fields: { priority: 'medium' },
      });
    });

    it('rejects invalid fields with invalid_fields without writing anything', () => {
      const create = () =>
        createItem(ctx, { ...task('X'), fields: { description: 'D', priority: 'urgent' } });

      expect(create).toThrow(expect.objectContaining({ code: 'invalid_fields' }));
      expect(listItems(ctx)).toEqual([]);
      expect(createItem(ctx, task('Y')).id).toBe('TASKS-1');
    });

    it('records a created event in the same write', () => {
      const now = clock('2026-01-01T00:00:00.000Z');
      createItem(ctx, task('First'), now);

      expect(getItem(ctx, 'TASKS-1').events).toEqual([
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
      const create = () => createItem(ctx, { ...task('X'), collection: 'nope' });

      expect(create).toThrow(expect.objectContaining({ code: 'not_found' }));
    });
  });

  describe('moveItem', () => {
    beforeEach(() => {
      createItem(ctx, task('First'), clock('t0'));
    });

    it('moves the item and appends a transitioned event', () => {
      const moved = moveItem(
        ctx,
        { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' },
        clock('t1'),
      );

      expect(moved).toMatchObject({ state: 'in_progress', turn: 'agent', updatedAt: 't1' });
      expect(moved.createdAt).toBe('t0');
      expect(
        getItem(ctx, 'TASKS-1').events.map(({ type, actor, at, data }) => ({
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
      const move = () =>
        moveItem(ctx, { id: 'TASKS-1', to: 'done', actor: bot, channel: 'cli' }, clock('t1'));

      expect(move).toThrow(expect.objectContaining({ code: 'invalid_transition' }));
      expect(getItem(ctx, 'TASKS-1')).toMatchObject({ state: 'todo', updatedAt: 't0' });
      expect(getItem(ctx, 'TASKS-1').events).toHaveLength(1);
    });

    it('rejects a move the actor lacks authority for without writing anything', () => {
      moveItem(ctx, { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' }, clock('t1'));
      moveItem(ctx, { id: 'TASKS-1', to: 'review', actor: bot, channel: 'cli' }, clock('t2'));

      const approve = () =>
        moveItem(ctx, { id: 'TASKS-1', to: 'done', actor: bot, channel: 'cli' }, clock('t3'));

      expect(approve).toThrow(expect.objectContaining({ code: 'forbidden' }));
      expect(getItem(ctx, 'TASKS-1')).toMatchObject({ state: 'review', updatedAt: 't2' });
      expect(getItem(ctx, 'TASKS-1').events).toHaveLength(3);
    });

    it('records the reason in the transitioned event', () => {
      moveItem(ctx, { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' });
      moveItem(ctx, { id: 'TASKS-1', to: 'review', actor: bot, channel: 'cli' });

      moveItem(ctx, { id: 'TASKS-1', to: 'todo', actor: ana, channel: 'ui', reason: 'Add tests' });

      expect(getItem(ctx, 'TASKS-1').events.at(-1)?.data).toEqual({
        from: 'review',
        to: 'todo',
        reason: 'Add tests',
      });
    });

    it('requires a reason when the transition does', () => {
      moveItem(ctx, { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' });
      moveItem(ctx, { id: 'TASKS-1', to: 'review', actor: bot, channel: 'cli' });

      const reject = () => moveItem(ctx, { id: 'TASKS-1', to: 'todo', actor: ana, channel: 'ui' });

      expect(reject).toThrow(expect.objectContaining({ code: 'reason_required' }));
    });

    it('fails with not_found for an unknown item', () => {
      const move = () =>
        moveItem(ctx, { id: 'TASKS-9', to: 'in_progress', actor: bot, channel: 'cli' });

      expect(move).toThrow(expect.objectContaining({ code: 'not_found' }));
    });
  });

  describe('showItem', () => {
    it('adds the moves the performer may make from the current state', () => {
      createItem(ctx, task('First'));

      const shown = showItem(ctx, 'TASKS-1', { actor: bot, channel: 'cli' });

      expect(shown).toMatchObject({ id: 'TASKS-1', events: [{ type: 'created' }] });
      expect(shown.transitions).toEqual([
        { to: 'in_progress', by: 'agent', reasonRequired: false },
      ]);
    });
  });

  describe('getItem', () => {
    it('fails with not_found for an unknown id', () => {
      expect(() => getItem(ctx, 'TASKS-9')).toThrow(expect.objectContaining({ code: 'not_found' }));
    });

    it('does not change the item when read', () => {
      createItem(ctx, task('First'), clock('t0'));
      const before = getItem(ctx, 'TASKS-1');

      expect(getItem(ctx, 'TASKS-1')).toEqual(before);
    });
  });

  describe('listItems', () => {
    beforeEach(() => {
      addCollection(ctx, { name: 'reviews', preset: 'reviews' });
      const now = clock('t0');
      createItem(ctx, task('A'), now);
      createItem(ctx, { collection: 'reviews', title: 'B', actor: bot }, now);
      createItem(ctx, task('C'), now);
      moveItem(ctx, { id: 'TASKS-2', to: 'in_progress', actor: bot, channel: 'cli' }, now);
    });

    const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

    it('lists every item in creation order', () => {
      expect(ids(listItems(ctx))).toEqual(['TASKS-1', 'REVIEWS-1', 'TASKS-2']);
    });

    it('filters by collection', () => {
      expect(ids(listItems(ctx, { collection: 'tasks' }))).toEqual(['TASKS-1', 'TASKS-2']);
    });

    it('filters by state', () => {
      expect(ids(listItems(ctx, { state: 'in_progress' }))).toEqual(['TASKS-2']);
    });

    it('filters by derived turn', () => {
      expect(ids(listItems(ctx, { turn: 'human' }))).toEqual(['REVIEWS-1']);
      expect(ids(listItems(ctx, { turn: 'agent' }))).toEqual(['TASKS-1', 'TASKS-2']);
    });

    it('combines filters', () => {
      expect(ids(listItems(ctx, { collection: 'tasks', state: 'todo', turn: 'agent' }))).toEqual([
        'TASKS-1',
      ]);
    });
  });
});
