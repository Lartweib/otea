import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { insertItem, selectItems } from '../store/queries.ts';
import { addCollection, nameImplicitTypes } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, listItems } from './items.ts';
import { memoryContext, REVIEWS } from './testing.ts';
import { validateProject } from './validate.ts';

const ana: Actor = { kind: 'human', name: 'ana' };

// An item stored before its preset named its only type, as the implicit type then called it.
function stored(ctx: Context, collection: string, id: string) {
  insertItem(ctx.db, {
    id,
    collection,
    seq: Number(id.split('-')[1]),
    type: 'item',
    title: 'Old',
    fields: { description: 'Before' },
    presetVersion: 2,
    state: 'todo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: ana,
    lease: null,
  });
}

describe('single-type naming', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
    addCollection(ctx, { name: 'tasks' });
    addCollection(ctx, { name: 'bugs', preset: 'bug-triage' });
    addCollection(ctx, { name: 'design', preset: 'reviews' });
  });

  afterEach(() => ctx.db.close());

  it('names the only type of each official single-type preset', () => {
    const typeOf = (collection: string) =>
      createItem(ctx, { collection, title: 'X', actor: ana }).type;

    expect(typeOf('tasks')).toBe('task');
    expect(typeOf('bugs')).toBe('bug');
    expect(typeOf('design')).toBe('item');
  });

  it('renames stored items of the implicit type to the name their preset gives its only type', () => {
    stored(ctx, 'tasks', 'TASKS-1');
    stored(ctx, 'design', 'DESIGN-1');

    expect(nameImplicitTypes(ctx)).toBe(1);
    expect(nameImplicitTypes(ctx)).toBe(0);
    expect(selectItems(ctx.db, {}).map(({ id, type }) => [id, type])).toEqual([
      ['TASKS-1', 'task'],
      ['DESIGN-1', 'item'],
    ]);
    expect(listItems(ctx, { type: 'task' }).map(({ id }) => id)).toEqual(['TASKS-1']);
    expect(validateProject(ctx).findings.filter(({ subject }) => subject === 'TASKS-1')).toEqual(
      [],
    );
  });
});
