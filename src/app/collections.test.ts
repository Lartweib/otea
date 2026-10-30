import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection, getCollection, listCollectionViews } from './collections.ts';
import type { Context } from './context.ts';
import { memoryContext, REVIEWS } from './testing.ts';

describe('collections', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
  });

  afterEach(() => ctx.db.close());

  it('adds a collection with the tasks preset by default', () => {
    const collection = addCollection(ctx, { name: 'tasks' });

    expect(collection).toEqual({
      name: 'tasks',
      prefix: 'TASKS',
      preset: 'tasks',
      presetVersion: 1,
      nextSeq: 1,
    });
    expect(getCollection(ctx.db, 'tasks')).toEqual(collection);
  });

  it('records the chosen preset and its version', () => {
    addCollection(ctx, { name: 'design', preset: 'reviews' });

    expect(getCollection(ctx.db, 'design')).toMatchObject({ preset: 'reviews', presetVersion: 3 });
  });

  it('fails with not_found for an unknown preset', () => {
    expect(() => addCollection(ctx, { name: 'x', preset: 'nope' })).toThrow(
      expect.objectContaining({ code: 'not_found', message: 'Preset "nope" not found' }),
    );
  });

  it('rejects a duplicate name with already_exists', () => {
    addCollection(ctx, { name: 'tasks' });

    expect(() => addCollection(ctx, { name: 'tasks' })).toThrow(
      expect.objectContaining({ code: 'already_exists' }),
    );
  });

  it('rejects a name whose prefix is taken with already_exists', () => {
    addCollection(ctx, { name: 'bug-reports' });

    expect(() => addCollection(ctx, { name: 'bugreports' })).toThrow(
      expect.objectContaining({ code: 'already_exists' }),
    );
  });

  it('rejects a name without a usable prefix with invalid_name', () => {
    expect(() => addCollection(ctx, { name: '!!' })).toThrow(
      expect.objectContaining({ code: 'invalid_name' }),
    );
  });

  it('fails with not_found for an unknown collection', () => {
    expect(() => getCollection(ctx.db, 'missing')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('lists each collection with the types, entry states and view of its preset', () => {
    addCollection(ctx, { name: 'tasks' });
    addCollection(ctx, { name: 'design', preset: 'reviews' });

    const views = listCollectionViews(ctx);

    expect(views.map(({ name, prefix, preset, view }) => ({ name, prefix, preset, view }))).toEqual(
      [
        {
          name: 'tasks',
          prefix: 'TASKS',
          preset: 'tasks',
          view: { kind: 'list', groupBy: 'turn' },
        },
        {
          name: 'design',
          prefix: 'DESIGN',
          preset: 'reviews',
          view: { kind: 'list', groupBy: 'turn' },
        },
      ],
    );
    expect(views[0]?.types).toEqual([
      {
        name: 'item',
        label: 'Item',
        initial: 'todo',
        incomplete: 'incomplete',
        states: expect.arrayContaining([
          { name: 'review', turn: 'human' },
          { name: 'done', turn: 'none', closes: 'done' },
        ]),
        fields: [
          { name: 'title', module: 'text', required: 'create' },
          { name: 'description', module: 'markdown', required: 'complete' },
          {
            name: 'priority',
            module: 'enum',
            values: ['low', 'medium', 'high'],
            default: 'medium',
          },
        ],
        layout: expect.objectContaining({
          intake: [
            { module: 'text', field: 'title' },
            { module: 'markdown', field: 'description' },
            { module: 'enum', field: 'priority' },
          ],
        }),
      },
    ]);
    expect(views[1]?.types).toEqual([
      expect.objectContaining({
        name: 'item',
        initial: 'open',
        fields: [{ name: 'title', module: 'text', required: 'create' }],
      }),
    ]);
  });
});
