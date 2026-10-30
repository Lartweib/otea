import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { mixedPreset } from '../core/testing.ts';
import { addCollection, listCollectionViews } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, listItems, moveItem, showItem, updateItem } from './items.ts';
import { claimItem } from './leases.ts';
import { listPresetViews } from './preset-views.ts';
import { memoryContext } from './testing.ts';
import { validateProject } from './validate.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const bot: Actor = { kind: 'agent', name: 'claude' };
const asBot = { actor: bot, channel: 'cli' } as const;

describe('item types', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(mixedPreset);
    addCollection(ctx, { name: 'work', preset: 'work' });
    addCollection(ctx, { name: 'tasks' });
  });

  afterEach(() => ctx.db.close());

  const bug = () =>
    createItem(ctx, {
      collection: 'work',
      type: 'bug',
      title: 'Crash',
      fields: { severity: 'high' },
      actor: ana,
    });

  const idea = (fields: Record<string, string> = { pitch: 'Faster boot' }) =>
    createItem(ctx, { collection: 'work', type: 'impr', title: 'Boot', fields, actor: bot });

  describe('createItem', () => {
    it('creates each item with its type, its fields and the workflow of its type', () => {
      expect(bug()).toMatchObject({ id: 'WORK-1', type: 'bug', state: 'reported', turn: 'human' });
      expect(idea()).toMatchObject({ id: 'WORK-2', type: 'impr', state: 'idea', turn: 'human' });
      expect(idea({})).toMatchObject({ type: 'impr', state: 'draft', turn: 'agent' });
    });

    it('gives an item of a preset without types the implicit type', () => {
      const task = createItem(ctx, { collection: 'tasks', title: 'Docs', actor: ana });

      expect(task.type).toBe('item');
    });

    it('needs a type when the preset has several, and a known one', () => {
      const untyped = () => createItem(ctx, { collection: 'work', title: 'X', actor: ana });
      const unknown = () =>
        createItem(ctx, { collection: 'work', type: 'epic', title: 'X', actor: ana });

      expect(untyped).toThrow(expect.objectContaining({ code: 'invalid_type' }));
      expect(unknown).toThrow(expect.objectContaining({ code: 'invalid_type' }));
      expect(listItems(ctx)).toEqual([]);
    });

    it('validates fields against the type', () => {
      const pitchOnBug = () =>
        createItem(ctx, {
          collection: 'work',
          type: 'bug',
          title: 'X',
          fields: { severity: 'low', pitch: 'P' },
          actor: ana,
        });

      expect(pitchOnBug).toThrow(expect.objectContaining({ code: 'invalid_fields' }));
    });
  });

  it('lists by type', () => {
    bug();
    idea();

    expect(listItems(ctx, { type: 'impr' }).map(({ id }) => id)).toEqual(['WORK-2']);
    expect(listItems(ctx, { collection: 'work' }).map(({ type }) => type)).toEqual(['bug', 'impr']);
  });

  it('shows the moves and missing fields of the item type', () => {
    bug();
    idea({});

    expect(showItem(ctx, 'WORK-1', asBot).transitions).toEqual([]);
    expect(showItem(ctx, 'WORK-2', asBot)).toMatchObject({
      type: 'impr',
      missing: ['pitch'],
      transitions: [
        { to: 'idea', by: 'agent', reasonRequired: false, turn: 'human' },
        { to: 'dropped', by: 'agent', reasonRequired: true, turn: 'none' },
      ],
    });
  });

  it('moves, updates and claims along the workflow of the item type', () => {
    idea({});
    claimItem(ctx, { id: 'WORK-1', actor: bot });
    updateItem(ctx, { id: 'WORK-1', fields: { pitch: 'Cache it' }, actor: bot });

    const moved = moveItem(ctx, { id: 'WORK-1', to: 'idea', ...asBot });

    expect(moved).toMatchObject({ state: 'idea', turn: 'human', lease: null });
    expect(() =>
      updateItem(ctx, { id: 'WORK-1', fields: { severity: 'low' }, actor: bot }),
    ).toThrow(expect.objectContaining({ code: 'invalid_fields' }));
  });

  it('says how a closed item was closed, from the state of its type', () => {
    idea();
    idea();
    const asHuman = { actor: ana, channel: 'ui' } as const;

    const shipped = moveItem(ctx, { id: 'WORK-1', to: 'planned', ...asHuman });
    const parked = moveItem(ctx, { id: 'WORK-2', to: 'dropped', reason: 'Later', ...asHuman });

    expect(shipped).toMatchObject({ state: 'planned', turn: 'none', closes: 'done' });
    expect(parked).toMatchObject({ state: 'dropped', turn: 'none', closes: 'discarded' });
    expect(listItems(ctx).map(({ closes }) => closes)).toEqual(['done', 'discarded']);
    expect(showItem(ctx, 'WORK-1', asBot).closes).toBe('done');
    expect(idea()).not.toHaveProperty('closes');
  });

  it('describes the types, layouts and view of each collection and preset', () => {
    const work = listCollectionViews(ctx).find(({ name }) => name === 'work');
    const preset = listPresetViews(ctx).find(({ name }) => name === 'work');

    expect(work?.view).toEqual({ kind: 'list', groupBy: 'turn' });
    expect(work?.types.map(({ name, label, initial }) => [name, label, initial])).toEqual([
      ['bug', 'Bug', 'reported'],
      ['impr', 'Improvement', 'idea'],
    ]);
    expect(work?.types[1]).toMatchObject({
      incomplete: 'draft',
      layout: { body: [{ module: 'markdown', field: 'pitch' }, { module: 'questions' }] },
    });
    expect(work?.types[0]?.fields.map(({ name }) => name)).toEqual(['title', 'area', 'severity']);
    expect(work?.types[1]?.states).toEqual([
      { name: 'draft', turn: 'agent' },
      { name: 'idea', turn: 'human' },
      { name: 'planned', turn: 'none', closes: 'done' },
      { name: 'dropped', turn: 'none', closes: 'discarded' },
    ]);
    expect(preset?.types.map(({ name }) => name)).toEqual(['bug', 'impr']);
    expect(preset?.fields.map(({ name }) => name)).toEqual(['title', 'area', 'severity', 'pitch']);
  });

  it('reports items of an unknown type as errors', () => {
    bug();
    ctx.db.exec("UPDATE items SET type = 'epic' WHERE id = 'WORK-1'");

    expect(validateProject(ctx).findings).toEqual([
      {
        severity: 'error',
        subject: 'WORK-1',
        message: 'unknown type "epic" in preset work (types: bug, impr)',
      },
    ]);
  });
});
