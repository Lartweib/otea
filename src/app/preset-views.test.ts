import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { listPresetViews } from './preset-views.ts';
import { memoryContext, REVIEWS } from './testing.ts';

describe('preset views', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
  });

  afterEach(() => ctx.db.close());

  it('lists every loaded preset, official first, with its origin and fields', () => {
    const views = listPresetViews(ctx);

    expect(views.map(({ name }) => name)).toEqual(['bug-triage', 'tasks', 'reviews']);
    expect(views.slice(1).map(({ types, view, ...rest }) => rest)).toEqual([
      {
        name: 'tasks',
        version: 1,
        origin: 'official',
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
        collections: [],
      },
      {
        name: 'reviews',
        version: 3,
        origin: 'project',
        fields: [{ name: 'title', module: 'text', required: 'create' }],
        collections: [],
      },
    ]);
    expect(views[1]?.types.map(({ name, label }) => [name, label])).toEqual([['item', 'Item']]);
    expect(views[1]?.view).toEqual({
      kind: 'list',
      groupBy: 'turn',
      columns: ['id', 'title', 'priority', 'state', 'who', 'age'],
    });
  });

  it('names the collections that use each preset', () => {
    addCollection(ctx, { name: 'tasks' });
    addCollection(ctx, { name: 'design', preset: 'reviews' });
    addCollection(ctx, { name: 'bugs' });

    expect(listPresetViews(ctx).map(({ name, collections }) => ({ name, collections }))).toEqual([
      { name: 'bug-triage', collections: [] },
      { name: 'tasks', collections: ['tasks', 'bugs'] },
      { name: 'reviews', collections: ['design'] },
    ]);
  });
});
