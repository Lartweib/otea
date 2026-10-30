import { describe, expect, it } from 'vitest';
import {
  type CollapseStorage,
  nestSections,
  parentOf,
  readCollapsed,
  toggleCollapsed,
  writeCollapsed,
} from './nesting.ts';
import type { Section } from './sections.ts';
import type { Item, Turn } from './types.ts';

const item = (id: string, turn: Turn, parent?: string, open?: number) =>
  ({
    id,
    turn,
    ...(parent ? { relations: [{ kind: 'parent', id: parent }] } : {}),
    ...(open === undefined ? {} : { children: { total: open + 1, open, done: 1, discarded: 0 } }),
  }) as Item;

const section = (turn: Turn, items: Item[]): Section => ({ turn, title: turn, items });

const ids = (sections: Section[]) => sections.map((each) => each.items.map(({ id }) => id));

describe('parentOf', () => {
  it('reads the parent from the relations', () => {
    expect(parentOf(item('P-1', 'agent', 'E-1'))).toBe('E-1');
    expect(parentOf(item('P-1', 'agent'))).toBeUndefined();
  });
});

describe('nestSections', () => {
  const sections = [
    section('human', [item('P-3', 'human', 'E-1')]),
    section('agent', [
      item('P-1', 'agent', 'E-1'),
      item('X-1', 'agent'),
      item('E-1', 'agent', undefined, 2),
      item('P-2', 'agent', 'E-1'),
      item('G-1', 'agent', 'P-2'),
    ]),
  ];

  it('puts children right under their parent when both are in the same section', () => {
    const nested = nestSections(sections, new Set());

    expect(ids(nested.sections)).toEqual([['P-3'], ['X-1', 'E-1', 'P-1', 'P-2', 'G-1']]);
    expect(nested.rows.get('P-1')).toEqual({ depth: 1 });
    expect(nested.rows.get('G-1')).toEqual({ depth: 2 });
    expect(nested.rows.get('E-1')).toEqual({ depth: 0, nested: 2, collapsed: false });
    expect(nested.rows.get('P-3')).toEqual({ depth: 0 });
  });

  it('hides the children of a collapsed parent, and their own children', () => {
    const nested = nestSections(sections, new Set(['E-1']));

    expect(ids(nested.sections)).toEqual([['P-3'], ['X-1', 'E-1']]);
    expect(nested.rows.get('E-1')).toEqual({ depth: 0, nested: 2, collapsed: true });
  });

  it('keeps a child that waits for you in its own section, whatever its parent does', () => {
    const nested = nestSections(sections, new Set(['E-1']));

    expect(nested.sections[0]?.items.map(({ id }) => id)).toEqual(['P-3']);
  });

  it('counts every item of a section, shown or folded', () => {
    const nested = nestSections(sections, new Set(['E-1']));

    expect(nested.sections.map(({ total }) => total)).toEqual([1, 5]);
  });

  it('survives a parent loop in stale data without losing items', () => {
    const loop = [section('agent', [item('A', 'agent', 'B'), item('B', 'agent', 'A')])];

    expect(ids(nestSections(loop, new Set()).sections)[0]?.sort()).toEqual(['A', 'B']);
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

  it('toggles one parent', () => {
    expect(toggleCollapsed(new Set(['E-1']), 'E-1')).toEqual(new Set());
    expect(toggleCollapsed(new Set(), 'E-1')).toEqual(new Set(['E-1']));
  });
});
