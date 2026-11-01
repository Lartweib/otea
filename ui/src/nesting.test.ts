import { describe, expect, it } from 'vitest';
import {
  type CollapseStorage,
  EXPANDED_KEY,
  type Folds,
  nestSections,
  parentOf,
  readCollapsed,
  toggleCollapsed,
  toggleFold,
  writeCollapsed,
} from './nesting.ts';
import type { Section } from './sections.ts';
import type { Item, Turn } from './types.ts';

const item = (id: string, turn: Turn, parent?: string, open?: number) =>
  ({
    id,
    title: `Title of ${id}`,
    turn,
    ...(parent ? { relations: [{ kind: 'parent', id: parent }] } : {}),
    ...(open === undefined ? {} : { children: { total: open + 1, open, done: 1, discarded: 0 } }),
  }) as Item;

const section = (turn: Turn, items: Item[]): Section => ({ key: turn, turn, title: turn, items });

const folds = (collapsed: string[] = [], expanded: string[] = []): Folds => ({
  collapsed: new Set(collapsed),
  expanded: new Set(expanded),
});

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
    const nested = nestSections(sections, folds());

    expect(ids(nested.sections)).toEqual([['P-3'], ['X-1', 'E-1', 'P-1', 'P-2', 'G-1']]);
    expect(nested.rows.get('P-1')).toEqual({ depth: 1 });
    expect(nested.rows.get('G-1')).toEqual({ depth: 2 });
    expect(nested.rows.get('E-1')).toEqual({ depth: 0, nested: 2, collapsed: false });
  });

  it('hides the children of a collapsed parent, and their own children', () => {
    const nested = nestSections(sections, folds(['E-1']));

    expect(ids(nested.sections)).toEqual([['P-3'], ['X-1', 'E-1']]);
    expect(nested.rows.get('E-1')).toEqual({ depth: 0, nested: 2, collapsed: true });
  });

  it('keeps a child that waits for you in its own section, whatever its parent does', () => {
    const nested = nestSections(sections, folds(['E-1']));

    expect(nested.sections[0]?.items.map(({ id }) => id)).toEqual(['P-3']);
  });

  it('counts every item of a section, shown or folded', () => {
    const nested = nestSections(sections, folds(['E-1']));

    expect(nested.sections.map(({ total }) => total)).toEqual([1, 5]);
  });

  it('points a child in another group to its parent, by id and title', () => {
    const nested = nestSections(sections, folds());

    expect(nested.rows.get('P-3')).toEqual({
      depth: 0,
      parent: { id: 'E-1', title: 'Title of E-1' },
    });
    expect(nested.rows.get('P-1')).not.toHaveProperty('parent');
  });

  it('names a parent outside the sections when it can find it, and by id otherwise', () => {
    const lonely = [section('human', [item('C-1', 'human', 'O-1'), item('C-2', 'human', 'O-2')])];
    const other = item('O-1', 'agent');

    const nested = nestSections(lonely, folds(), (id) => (id === 'O-1' ? other : undefined));

    expect(nested.rows.get('C-1')?.parent).toEqual({ id: 'O-1', title: 'Title of O-1' });
    expect(nested.rows.get('C-2')?.parent).toEqual({ id: 'O-2' });
  });

  describe('a parent whose children are all closed', () => {
    const settled = (id: string, turn: Turn, total: number) =>
      ({ ...item(id, turn), children: { total, open: 0, done: total, discarded: 0 } }) as Item;
    const closedOf = [
      section('human', [settled('R-1', 'human', 2), item('H-1', 'human')]),
      section('agent', []),
      section('none', [
        item('C-1', 'none', 'R-1'),
        item('Z-1', 'none'),
        item('C-2', 'none', 'R-1'),
      ]),
    ];

    it('takes its closed children under it, folded by default', () => {
      const nested = nestSections(closedOf, folds());

      expect(ids(nested.sections)).toEqual([['R-1', 'H-1'], [], ['Z-1']]);
      expect(nested.rows.get('R-1')).toEqual({
        depth: 0,
        nested: 2,
        collapsed: true,
        settled: true,
      });
      expect(nested.sections.map(({ total }) => total)).toEqual([2, 0, 1]);
    });

    it('lists them under it once the viewer unfolds it', () => {
      const nested = nestSections(closedOf, folds([], ['R-1']));

      expect(ids(nested.sections)).toEqual([['R-1', 'C-1', 'C-2', 'H-1'], [], ['Z-1']]);
      expect(nested.rows.get('R-1')?.collapsed).toBe(false);
      expect(nested.rows.get('C-1')).toEqual({ depth: 1 });
    });

    it('leaves closed children in Closed, pointing to their parent, while a sibling is open', () => {
      const open = [
        section('human', [
          {
            ...item('R-1', 'human'),
            children: { total: 3, open: 1, done: 2, discarded: 0 },
          } as Item,
        ]),
        section('none', [item('C-1', 'none', 'R-1')]),
      ];

      const nested = nestSections(open, folds());

      expect(ids(nested.sections)).toEqual([['R-1'], ['C-1']]);
      expect(nested.rows.get('C-1')?.parent).toEqual({ id: 'R-1', title: 'Title of R-1' });
    });

    it('keeps closed children of a closed parent nested under it in Closed', () => {
      const allClosed = [section('none', [settled('R-1', 'none', 1), item('C-1', 'none', 'R-1')])];

      const nested = nestSections(allClosed, folds([], ['R-1']));

      expect(ids(nested.sections)).toEqual([['R-1', 'C-1']]);
    });
  });

  it('survives a parent loop in stale data without losing items', () => {
    const loop = [section('agent', [item('A', 'agent', 'B'), item('B', 'agent', 'A')])];

    expect(ids(nestSections(loop, folds()).sections)[0]?.sort()).toEqual(['A', 'B']);
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
