import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { listEvents } from './events.ts';
import { createItem, moveItem } from './items.ts';
import { memoryContext, REVIEWS } from './testing.ts';

const bot: Actor = { kind: 'agent', name: 'claude' };
const T0 = '2026-01-01T00:00:00.000Z';
const at = () => T0;

describe('listEvents', () => {
  let ctx: Context;

  const summary = (filter: Parameters<typeof listEvents>[1] = {}) =>
    listEvents(ctx, filter).map(({ id, itemId, type }) => `${id} ${itemId} ${type}`);

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
    addCollection(ctx, { name: 'tasks' });
    addCollection(ctx, { name: 'reviews', preset: 'reviews' });
    const task = { collection: 'tasks', fields: { description: 'D' }, actor: bot };
    createItem(ctx, { ...task, title: 'First' }, at);
    createItem(ctx, { collection: 'reviews', title: 'Copy', actor: bot }, at);
    moveItem(ctx, { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' }, at);
  });

  afterEach(() => ctx.db.close());

  it('lists every event in commit order with the shape of the item timeline', () => {
    expect(summary()).toEqual([
      '1 TASKS-1 created',
      '2 REVIEWS-1 created',
      '3 TASKS-1 transitioned',
    ]);
    expect(listEvents(ctx).at(-1)).toEqual({
      id: 3,
      itemId: 'TASKS-1',
      type: 'transitioned',
      actor: bot,
      at: T0,
      data: { from: 'todo', to: 'in_progress', channel: 'cli' },
    });
  });

  it('lists only events after the since cursor', () => {
    expect(summary({ since: 1 })).toEqual(['2 REVIEWS-1 created', '3 TASKS-1 transitioned']);
    expect(summary({ since: 3 })).toEqual([]);
  });

  it('filters by item and by collection', () => {
    expect(summary({ item: 'TASKS-1' })).toEqual(['1 TASKS-1 created', '3 TASKS-1 transitioned']);
    expect(summary({ collection: 'reviews' })).toEqual(['2 REVIEWS-1 created']);
  });

  it('caps the oldest events first with limit', () => {
    expect(summary({ since: 1, limit: 1 })).toEqual(['2 REVIEWS-1 created']);
  });

  it('fails with not_found for an unknown item or collection', () => {
    expect(() => listEvents(ctx, { item: 'TASKS-9' })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => listEvents(ctx, { collection: 'bugs' })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
});
