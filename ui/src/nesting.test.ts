import { describe, expect, it } from 'vitest';
import {
  type CollapseStorage,
  EXPANDED_KEY,
  type Folds,
  parentOf,
  readCollapsed,
  toggleCollapsed,
  toggleFold,
  writeCollapsed,
} from './nesting.ts';
import type { Item, Turn } from './types.ts';

const item = (id: string, turn: Turn, parent?: string, open?: number) =>
  ({
    id,
    title: `Title of ${id}`,
    turn,
    ...(parent ? { relations: [{ kind: 'parent', id: parent }] } : {}),
    ...(open === undefined ? {} : { children: { total: open + 1, open, done: 1, discarded: 0 } }),
  }) as Item;

const folds = (collapsed: string[] = [], expanded: string[] = []): Folds => ({
  collapsed: new Set(collapsed),
  expanded: new Set(expanded),
});

describe('parentOf', () => {
  it('reads the parent from the relations', () => {
    expect(parentOf(item('P-1', 'agent', 'E-1'))).toBe('E-1');
    expect(parentOf(item('P-1', 'agent'))).toBeUndefined();
  });
});

describe('collapsed parents in storage', () => {
  const memory = (
    initial: Record<string, string> = {},
  ): CollapseStorage & {
    values: Record<string, string>;
  } => {
    const values = { ...initial };
    return {
      values,
      getItem: (key) => values[key] ?? null,
      setItem: (key, value) => {
        values[key] = value;
      },
    };
  };

  it('remembers the parents a viewer collapsed', () => {
    const storage = memory();

    writeCollapsed(storage, new Set(['E-1', 'E-2']));

    expect(readCollapsed(storage)).toEqual(new Set(['E-1', 'E-2']));
  });

  it('reads nothing from broken or missing storage', () => {
    const throwing: CollapseStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readCollapsed(undefined)).toEqual(new Set());
    expect(readCollapsed(throwing)).toEqual(new Set());
    expect(readCollapsed(memory({ 'otea.collapsed': '{nope' }))).toEqual(new Set());
    expect(readCollapsed(memory({ 'otea.collapsed': '[1, "E-1"]' }))).toEqual(new Set(['E-1']));
    expect(() => writeCollapsed(throwing, new Set(['E-1']))).not.toThrow();
  });

  it('remembers unfolded parents under their own key', () => {
    const storage = memory();

    writeCollapsed(storage, new Set(['R-1']), EXPANDED_KEY);

    expect(storage.values[EXPANDED_KEY]).toBe('["R-1"]');
    expect(readCollapsed(storage, EXPANDED_KEY)).toEqual(new Set(['R-1']));
    expect(readCollapsed(storage)).toEqual(new Set());
  });

  it('toggles a settled parent in the unfolded set, any other in the folded set', () => {
    expect(toggleFold(folds(), 'R-1', true)).toEqual(folds([], ['R-1']));
    expect(toggleFold(folds(['E-1']), 'E-1', false)).toEqual(folds());
  });

  it('toggles one parent', () => {
    expect(toggleCollapsed(new Set(['E-1']), 'E-1')).toEqual(new Set());
    expect(toggleCollapsed(new Set(), 'E-1')).toEqual(new Set(['E-1']));
  });
});
