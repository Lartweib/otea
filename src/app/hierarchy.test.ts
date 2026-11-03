import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { hierarchyPreset, mixedPreset } from '../core/testing.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, listItems } from './items.ts';
import { linkItems, listRelations } from './relations.ts';
import { memoryContext } from './testing.ts';

const bot: Actor = { kind: 'agent', name: 'claude' };

describe('type hierarchy', () => {
  let ctx: Context;

  const make = (collection: string, type: string, parent?: string) =>
    createItem(ctx, {
      collection,
      type,
      title: `A ${type}`,
      actor: bot,
      ...(parent ? { parent } : {}),
    }).id;
  const link = (id: string, to: string) =>
    linkItems(ctx, { id, kind: 'parent', other: to, actor: bot, channel: 'cli' });
  const failure = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      const { code, message } = error as { code?: string; message: string };
      return { code, message };
    }
    return undefined;
  };

  beforeEach(() => {
    ctx = memoryContext(hierarchyPreset, mixedPreset);
    addCollection(ctx, { name: 'board', preset: 'agile' });
    addCollection(ctx, { name: 'work', preset: 'work' });
    make('board', 'epic');
    make('board', 'bug');
  });

  afterEach(() => ctx.db.close());

  describe('creating', () => {
    it('creates a child of a type its parent takes', () => {
      const story = make('board', 'story', 'BOARD-1');

      expect(make('board', 'bug', story)).toBe('BOARD-4');
      expect(listRelations(ctx).map(({ from, to }) => [from, to])).toEqual([
        ['BOARD-3', 'BOARD-1'],
        ['BOARD-4', 'BOARD-3'],
      ]);
    });

    it('refuses a child of a type its parent does not take, and creates nothing', () => {
      expect(failure(() => make('board', 'epic', 'BOARD-1'))).toEqual({
        code: 'parent_type',
        message: 'BOARD-1 is an epic, which takes story and bug as children, not epic',
      });
      expect(failure(() => make('board', 'story', 'BOARD-2'))).toEqual({
        code: 'parent_type',
        message: 'BOARD-2 is a bug, which takes no children',
      });
      expect(listItems(ctx, { collection: 'board' })).toHaveLength(2);
    });

    it('refuses a type that cannot stand alone without a parent, and creates nothing', () => {
      expect(failure(() => make('board', 'story'))).toEqual({
        code: 'parent_required',
        message: 'A story needs a parent (an epic); create it with --parent <id>',
      });
      expect(listItems(ctx, { collection: 'board' })).toHaveLength(2);
    });

    it('leaves a preset without a hierarchy alone', () => {
      const idea = make('work', 'impr');

      expect(make('work', 'impr', idea)).toBe('WORK-2');
      expect(make('work', 'impr', 'WORK-2')).toBe('WORK-3');
    });
  });

  describe('linking a parent', () => {
    it('links a child of a type its parent takes', () => {
      link('BOARD-2', 'BOARD-1');

      expect(listRelations(ctx)).toMatchObject([
        { kind: 'parent', from: 'BOARD-2', to: 'BOARD-1' },
      ]);
    });

    it('refuses a child of a type its parent does not take', () => {
      make('board', 'epic');

      expect(failure(() => link('BOARD-3', 'BOARD-1'))).toMatchObject({ code: 'parent_type' });
      expect(failure(() => link('BOARD-1', 'BOARD-2'))).toMatchObject({ code: 'parent_type' });
      expect(listRelations(ctx)).toEqual([]);
    });
  });
});
