import { describe, expect, it } from 'vitest';
import {
  cellText,
  columnWidth,
  filterChoices,
  filterItems,
  gridColumns,
  gridTemplate,
  gridTier,
  nextSort,
  shownColumns,
  sortItems,
} from './grid.ts';
import type { CollectionView, Item, Turn } from './types.ts';

const STATES = [
  { name: 'incomplete', turn: 'agent' as const },
  { name: 'reported', turn: 'human' as const },
  { name: 'needs_info', turn: 'agent' as const },
  { name: 'fixing', turn: 'agent' as const },
  { name: 'verify', turn: 'human' as const },
  { name: 'fixed', turn: 'none' as const, closes: 'done' as const },
];

const bugs: CollectionView = {
  name: 'bugs',
  prefix: 'BUGS',
  preset: 'bug-triage',
  types: [
    {
      name: 'item',
      label: 'Item',
      initial: 'reported',
      incomplete: 'incomplete',
      states: STATES,
      fields: [
        { name: 'title', module: 'text', required: 'create' },
        { name: 'steps', module: 'markdown' },
        { name: 'environment', module: 'text' },
        { name: 'severity', module: 'severity', values: ['low', 'medium', 'high', 'critical'] },
        {
          name: 'category',
          module: 'enum',
          values: ['crash', 'visual', 'gameplay', 'physics', 'audio', 'performance', 'ui'],
        },
        { name: 'area', module: 'enum', values: ['forest biome', 'farm', 'den', 'ui'] },
      ],
      layout: { header: [], evidence: [], body: [], side: [], row: [], phone: [], intake: [] },
    },
  ],
  view: {
    kind: 'grid',
    groupBy: 'turn',
    columns: ['id', 'title', 'category', 'severity', 'area', 'state', 'who', 'age'],
  },
};

const T0 = Date.parse('2026-11-01T12:00:00.000Z');
const ago = (minutes: number) => new Date(T0 - minutes * 60_000).toISOString();

type Seed = {
  n: number;
  state?: string;
  turn?: Turn;
  fields?: Record<string, string>;
  minutes?: number;
  holder?: string;
  title?: string;
};

const bug = ({ n, state = 'reported', turn = 'human', fields = {}, minutes = 1, ...rest }: Seed) =>
  ({
    id: `BUGS-${n}`,
    collection: 'bugs',
    type: 'item',
    title: rest.title ?? `Bug ${n}`,
    fields,
    presetVersion: 2,
    state,
    turn,
    createdAt: ago(minutes),
    updatedAt: ago(minutes),
    createdBy: { kind: 'agent', name: 'claude-a' },
    lease: rest.holder ? { holder: rest.holder, expiresAt: '2099-01-01T00:00:00.000Z' } : null,
  }) satisfies Item;

const ids = (items: readonly Item[]) => items.map(({ id }) => id);
const column = (key: string) => {
  const found = gridColumns(bugs).find((candidate) => candidate.key === key);
  if (!found) throw new Error(key);
  return found;
};

describe('gridColumns', () => {
  it('reads the preset columns in order, each field with its module', () => {
    expect(gridColumns(bugs).map(({ key, kind }) => [key, kind])).toEqual([
      ['id', 'id'],
      ['title', 'title'],
      ['category', 'enum'],
      ['severity', 'severity'],
      ['area', 'enum'],
      ['state', 'state'],
      ['who', 'who'],
      ['age', 'age'],
    ]);
  });

  it('drops a column whose field no type declares any more', () => {
    const stale = { ...bugs, view: { ...bugs.view, columns: ['id', 'title', 'gone', 'state'] } };

    expect(gridColumns(stale).map(({ key }) => key)).toEqual(['id', 'title', 'state']);
  });
});

describe('the grid width tiers', () => {
  it('puts a pane in a tier by its width alone', () => {
    expect([1320, 1000, 999, 880, 879, 760, 759, 640, 639, 340].map(gridTier)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it('drops columns in a fixed order: the last field first, then who and severity shrink, then the other fields', () => {
    const keys = (tier: 1 | 2 | 3 | 4) =>
      shownColumns(gridColumns(bugs), tier).map(({ column, compact }) =>
        compact ? `${column.key}*` : column.key,
      );

    expect(keys(1)).toEqual(['id', 'title', 'category', 'severity', 'area', 'state', 'who', 'age']);
    expect(keys(2)).toEqual(['id', 'title', 'category', 'severity', 'state', 'who', 'age']);
    expect(keys(3)).toEqual(['id', 'title', 'category', 'severity*', 'state', 'who*', 'age']);
    expect(keys(4)).toEqual(['id', 'title', 'severity*', 'state', 'who*', 'age']);
  });

  it('sizes each column, and lets only the title flex', () => {
    expect(columnWidth(column('id'), false)).toBe(72);
    expect(columnWidth(column('severity'), false)).toBe(112);
    expect(columnWidth(column('severity'), true)).toBe(52);
    expect(columnWidth(column('who'), false)).toBe(88);
    expect(columnWidth(column('who'), true)).toBe(44);
    expect(columnWidth(column('age'), false)).toBe(56);
    expect(columnWidth(column('category'), false)).toBe(117);
    expect(columnWidth(column('area'), false)).toBe(124);
    expect(gridTemplate(shownColumns(gridColumns(bugs), 4))).toBe(
      '56px 28px 72px minmax(0, 1fr) 52px 110px 44px 56px',
    );
  });
});

describe('cellText', () => {
  it('reads built-in columns from the item and fields from its values', () => {
    const item = bug({ n: 3, fields: { category: 'crash' }, holder: 'claude-b' });

    expect(cellText(item, column('id'))).toBe('BUGS-3');
    expect(cellText(item, column('state'))).toBe('reported');
    expect(cellText(item, column('category'))).toBe('crash');
    expect(cellText(item, column('area'))).toBe('');
    expect(cellText(item, column('who'))).toBe('claude-b');
  });
});

describe('sorting', () => {
  it('cycles a column: its first direction, the other, then back to the default order', () => {
    expect(nextSort(null, column('title'))).toEqual({ key: 'title', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, column('title'))).toEqual({
      key: 'title',
      dir: 'desc',
    });
    expect(nextSort({ key: 'title', dir: 'desc' }, column('title'))).toBeNull();
    expect(nextSort({ key: 'title', dir: 'asc' }, column('severity'))).toEqual({
      key: 'severity',
      dir: 'desc',
    });
  });

  it('sorts ids by number, enums and severity by their values, and keeps empty cells last', () => {
    const items = [
      bug({ n: 10, fields: { severity: 'low', category: 'ui' } }),
      bug({ n: 9, fields: { severity: 'critical' } }),
      bug({ n: 100, fields: { category: 'crash' } }),
      bug({ n: 11, fields: { severity: 'high', category: 'visual' } }),
    ];
    const columns = gridColumns(bugs);
    const by = (key: string, dir: 'asc' | 'desc') => ids(sortItems(items, { key, dir }, columns));

    expect(by('id', 'asc')).toEqual(['BUGS-9', 'BUGS-10', 'BUGS-11', 'BUGS-100']);
    expect(by('severity', 'desc')).toEqual(['BUGS-9', 'BUGS-11', 'BUGS-10', 'BUGS-100']);
    expect(by('severity', 'asc')).toEqual(['BUGS-10', 'BUGS-11', 'BUGS-9', 'BUGS-100']);
    expect(by('category', 'asc')).toEqual(['BUGS-100', 'BUGS-11', 'BUGS-10', 'BUGS-9']);
  });

  it('sorts by age youngest first, by state in workflow order, and by who with nobody last', () => {
    const items = [
      bug({ n: 1, state: 'verify', minutes: 30, holder: 'claude-b' }),
      bug({ n: 2, state: 'incomplete', turn: 'agent', minutes: 5 }),
      bug({ n: 3, state: 'fixing', turn: 'agent', minutes: 90, holder: 'claude-a' }),
    ];
    const columns = gridColumns(bugs);
    const by = (key: string) => ids(sortItems(items, { key, dir: 'asc' }, columns));

    expect(by('age')).toEqual(['BUGS-2', 'BUGS-1', 'BUGS-3']);
    expect(by('state')).toEqual(['BUGS-2', 'BUGS-3', 'BUGS-1']);
    expect(by('who')).toEqual(['BUGS-3', 'BUGS-1', 'BUGS-2']);
  });

  it('keeps the given order without a sort, and between equal cells', () => {
    const items = [bug({ n: 2 }), bug({ n: 1 }), bug({ n: 3, fields: { area: 'den' } })];
    const columns = gridColumns(bugs);

    expect(ids(sortItems(items, null, columns))).toEqual(['BUGS-2', 'BUGS-1', 'BUGS-3']);
    expect(ids(sortItems(items, { key: 'area', dir: 'desc' }, columns))).toEqual([
      'BUGS-3',
      'BUGS-2',
      'BUGS-1',
    ]);
  });
});

describe('filtering', () => {
  const items = [
    bug({ n: 1, fields: { category: 'crash', severity: 'high' } }),
    bug({ n: 2, fields: { category: 'physics', severity: 'high' } }),
    bug({ n: 3, fields: { category: 'crash', severity: 'low' } }),
    bug({ n: 4, state: 'fixing', turn: 'agent', fields: { category: 'ui' } }),
  ];

  it('keeps the items that hold one of the chosen values of every filtered column', () => {
    expect(ids(filterItems(items, {}))).toEqual(['BUGS-1', 'BUGS-2', 'BUGS-3', 'BUGS-4']);
    expect(ids(filterItems(items, { category: ['crash', 'physics'] }))).toEqual([
      'BUGS-1',
      'BUGS-2',
      'BUGS-3',
    ]);
    expect(ids(filterItems(items, { category: ['crash'], severity: ['high'] }))).toEqual([
      'BUGS-1',
    ]);
    expect(ids(filterItems(items, { state: ['fixing'], category: [] }))).toEqual(['BUGS-4']);
  });

  it('offers each value with how many items the other filters leave, dropping the empty ones', () => {
    expect(filterChoices(items, column('category'), { severity: ['high'] })).toEqual([
      { value: 'crash', count: 1, on: false },
      { value: 'physics', count: 1, on: false },
    ]);
    expect(filterChoices(items, column('severity'), { severity: ['medium'] })).toEqual([
      { value: 'high', count: 2, on: false },
      { value: 'medium', count: 0, on: true },
      { value: 'low', count: 1, on: false },
    ]);
    expect(filterChoices(items, column('state'), {})).toEqual([
      { value: 'reported', count: 3, on: false },
      { value: 'fixing', count: 1, on: false },
    ]);
  });
});
