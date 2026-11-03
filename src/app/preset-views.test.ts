import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hierarchyPreset, mixedPreset } from '../core/testing.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { listPresetViews, typeViews } from './preset-views.ts';
import { memoryContext, REVIEWS } from './testing.ts';

describe('preset views', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
  });

  afterEach(() => ctx.db.close());

  it('lists every loaded preset, official first, with its origin and fields', () => {
    const views = listPresetViews(ctx);

    expect(views.map(({ name }) => name)).toEqual([
      'architecture',
      'bug-triage',
      'change',
      'review',
      'tasks',
      'reviews',
    ]);
    expect(views.slice(4).map(({ types, view, ...rest }) => rest)).toEqual([
      {
        name: 'tasks',
        version: 2,
        origin: 'official',
        icon: 'checklist',
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
        icon: null,
        fields: [{ name: 'title', module: 'text', required: 'create' }],
        collections: [],
      },
    ]);
    expect(views[4]?.types.map(({ name, label }) => [name, label])).toEqual([['task', 'Task']]);
    expect(views[4]?.view).toEqual({
      kind: 'list',
      groupBy: 'turn',
      columns: ['id', 'title', 'priority', 'state', 'who', 'age'],
    });
  });

  it('gives each type its children and whether it stands alone, in a preset with a hierarchy', () => {
    const views = typeViews(hierarchyPreset.types);

    expect(views.map(({ name, children, root }) => ({ name, children, root }))).toEqual([
      { name: 'epic', children: ['story', 'bug'], root: true },
      { name: 'story', children: ['bug'], root: false },
      { name: 'bug', children: [], root: true },
    ]);
    expect(typeViews(mixedPreset.types)[0]).not.toHaveProperty('children');
    expect(typeViews(mixedPreset.types)[0]).not.toHaveProperty('root');
  });

  it('gives a type the states each of its gated actions is allowed in, only when it has gates', () => {
    const change = listPresetViews(ctx).find(({ name }) => name === 'change');

    expect(change?.types.map(({ name, gates }) => [name, gates])).toEqual([
      ['change', undefined],
      ['repo_task', { push: ['implementing', 'revising'], merge: ['approved'] }],
    ]);
    expect(typeViews(mixedPreset.types)[0]).not.toHaveProperty('gates');
  });

  it('names the collections that use each preset', () => {
    addCollection(ctx, { name: 'tasks' });
    addCollection(ctx, { name: 'design', preset: 'reviews' });
    addCollection(ctx, { name: 'bugs' });

    expect(listPresetViews(ctx).map(({ name, collections }) => ({ name, collections }))).toEqual([
      { name: 'architecture', collections: [] },
      { name: 'bug-triage', collections: [] },
      { name: 'change', collections: [] },
      { name: 'review', collections: [] },
      { name: 'tasks', collections: ['tasks', 'bugs'] },
      { name: 'reviews', collections: ['design'] },
    ]);
  });
});
