import { describe, expect, it } from 'vitest';
import {
  availableColumns,
  cellText,
  chosenColumns,
  columnWidth,
  edgeKeyWidth,
  filterable,
  filterChoices,
  filterItems,
  fitColumns,
  gridColumns,
  gridTemplate,
  gridTier,
  nextSort,
  normalText,
  resizable,
  shownColumns,
  snapWidth,
  sortItems,
  textValues,
  type Widths,
  widthLimits,
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
        { name: 'area', module: 'text' },
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
  const found = availableColumns(bugs).find((candidate) => candidate.key === key);
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
      ['area', 'text'],
      ['state', 'state'],
      ['who', 'who'],
      ['age', 'age'],
    ]);
  });

  it('drops a column whose field no type declares any more', () => {
    const stale = { ...bugs, view: { ...bugs.view, columns: ['id', 'title', 'gone', 'state'] } };

    expect(gridColumns(stale).map(({ key }) => key)).toEqual(['id', 'title', 'state']);
  });

  it('filters by an enum, a severity, the state and free text; id, title, who and age only sort', () => {
    expect(['category', 'severity', 'area', 'state'].map((key) => filterable(column(key)))).toEqual(
      [true, true, true, true],
    );
    expect(['id', 'title', 'who', 'age'].map((key) => filterable(column(key)))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('the columns a collection offers', () => {
  it('offers the built-ins and every one-line field, each in its place in the preset order', () => {
    // environment, a field the preset does not list, goes after its last field; type before who.
    expect(availableColumns(bugs).map(({ key, kind }) => [key, kind])).toEqual([
      ['id', 'id'],
      ['title', 'title'],
      ['category', 'enum'],
      ['severity', 'severity'],
      ['area', 'text'],
      ['environment', 'text'],
      ['state', 'state'],
      ['type', 'type'],
      ['who', 'who'],
      ['age', 'age'],
    ]);
  });

  it('shows the chosen ones in that order, id and title always, the preset without a choice', () => {
    const keys = (chosen?: readonly string[]) => chosenColumns(bugs, chosen).map(({ key }) => key);

    expect(keys()).toEqual(gridColumns(bugs).map(({ key }) => key));
    expect(keys(['state', 'environment', 'gone'])).toEqual(['id', 'title', 'environment', 'state']);
  });

  it('puts id first and the built-ins before who when the preset leaves them out', () => {
    const short = { ...bugs, view: { ...bugs.view, columns: ['title', 'severity', 'who'] } };

    expect(availableColumns(short).map(({ key }) => key)).toEqual([
      'id',
      'title',
      'severity',
      'environment',
      'category',
      'area',
      'state',
      'type',
      'who',
      'age',
    ]);
    expect(chosenColumns(short).map(({ key }) => key)).toEqual(['id', 'title', 'severity', 'who']);
  });
});

describe('the grid width tiers', () => {
  it('puts a pane in a tier by its width alone', () => {
    expect([1320, 1000, 999, 880, 879, 760, 759, 640, 639, 340].map(gridTier)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it('drops columns in a fixed order: the last field first, then severity shrinks, then the other fields', () => {
    const keys = (tier: 1 | 2 | 3 | 4) =>
      shownColumns(gridColumns(bugs), tier).map(({ column, compact }) =>
        compact ? `${column.key}*` : column.key,
      );

    expect(keys(1)).toEqual(['id', 'title', 'category', 'severity', 'area', 'state', 'who', 'age']);
    expect(keys(2)).toEqual(['id', 'title', 'category', 'severity', 'state', 'who', 'age']);
    expect(keys(3)).toEqual(['id', 'title', 'category', 'severity*', 'state', 'who', 'age']);
    expect(keys(4)).toEqual(['id', 'title', 'severity*', 'state', 'who', 'age']);
  });

  it('sizes each column, and lets only the title flex', () => {
    expect(columnWidth(column('id'), false)).toBe(72);
    const long = gridColumns({ ...bugs, prefix: 'CREATURES' })[0];
    expect(long && columnWidth(long, false)).toBe(107);
    expect(columnWidth(column('severity'), false)).toBe(112);
    expect(columnWidth(column('severity'), true)).toBe(52);
    expect(columnWidth(column('who'), false)).toBe(44);
    expect(columnWidth(column('age'), false)).toBe(56);
    expect(columnWidth(column('category'), false)).toBe(117);
    expect(columnWidth(column('area'), false)).toBe(160);
    const { shown } = fitColumns(gridColumns(bugs), 640, {});
    expect(gridTemplate(shown, 640).tracks).toBe(
      '56px 28px 72px minmax(0, 1fr) 52px 110px 44px 56px',
    );
  });
});

// The grid's width beside the 244px sidebar: 1440 → 1179, 1920 → 1659, 2560 → 2299 (an item
// open: 1320), 3440 → 3179.
const layout = (room: number, sized: Widths = {}, columns = gridColumns(bugs)) => {
  const fitted = fitColumns(columns, room, sized);
  return { ...fitted, ...gridTemplate(fitted.shown, room) };
};

describe('the spare width', () => {
  it('gives the title what the other columns leave, up to 560, then shares the rest with the air', () => {
    const at = (room: number) => {
      const { title, air } = layout(room);
      return [title, air];
    };

    expect(at(1179)).toEqual([408, 0]);
    expect(at(1659)).toEqual([672, 36]);
    expect(at(2299)).toEqual([886, 107]);
    expect(at(1320)).toEqual([549, 0]);
    expect(at(3179)).toEqual([1640, 128]);
  });

  it('puts the air before every column after the title, so the table fills its room', () => {
    const { tracks } = layout(1659);

    expect(tracks).toBe('56px 28px 72px minmax(0, 1fr) 153px 148px 196px 146px 80px 92px');
    const px = tracks
      .replace('minmax(0, 1fr)', '0')
      .split(' ')
      .map((track) => Number.parseInt(track, 10) || 0);
    expect(px.reduce((sum, track) => sum + track, 0) + 672 + 16).toBe(1659);
  });

  it('keeps the air it is given (a drag holds it still), the title taking the difference', () => {
    const { shown } = fitColumns(gridColumns(bugs), 2299, { state: 150 });

    expect(gridTemplate(shown, 2299, 107)).toMatchObject({ air: 107, title: 846 });
    expect(gridTemplate(shown, 2299)).toMatchObject({ air: 103, title: 870 });
  });
});

describe('column widths', () => {
  const widths = (room: number, sized: Widths) =>
    Object.fromEntries(
      layout(room, sized).shown.map(({ column, width, compact }) => [
        column.key,
        compact ? `${width}*` : width,
      ]),
    );

  it('resizes every column but id, title, who and age', () => {
    expect(
      availableColumns(bugs)
        .filter(resizable)
        .map(({ key }) => key),
    ).toEqual(['category', 'severity', 'area', 'environment', 'state', 'type']);
  });

  it('takes a width the viewer gave, from the title, within the column limits', () => {
    expect(layout(1179, { state: 150 }).title).toBe(368);
    expect(widths(1179, { category: 10, area: 300, id: 300, who: 90 })).toMatchObject({
      id: 72,
      category: 64,
      area: 300,
      who: 44,
    });
    expect(widths(2299, { area: 900 }).area).toBe(480);
  });

  it('draws severity as bars alone under 112', () => {
    expect(widths(1179, { severity: 80 }).severity).toBe('80*');
    expect(widths(1179, { severity: 112 }).severity).toBe(112);
  });

  it('gives back the widened columns towards automatic, in proportion, before the title goes under 240', () => {
    const { title, shown } = layout(1179, { area: 480, category: 300 });

    expect(title).toBe(240);
    expect(widths(1179, { area: 480, category: 300 })).toMatchObject({ area: 267, category: 178 });
    expect(shown).toHaveLength(8);
  });

  it('then drops the fields in the tiers order, the last listed first', () => {
    const more = chosenColumns(bugs, [...bugs.view.columns, 'environment', 'type']);

    expect(layout(1179, {}, more).dropped).toEqual(['environment']);
    expect(layout(2299, {}, more)).toMatchObject({ dropped: [], title: 808, air: 61 });
    // At 760 the title would get 209: category steps out too.
    expect(layout(760).dropped).toEqual(['category', 'area']);
  });

  it('moves an edge by the keys: 16px, 64 with Shift, Home and End to the limits', () => {
    const limits = { min: 64, max: 278 };
    // After the title the edge is the column's left one: the left arrow widens it.
    const step = (key: string, shift = false, width = 110) =>
      edgeKeyWidth(key, shift, width, limits, 'start');

    expect(step('ArrowLeft')).toBe(126);
    expect(step('ArrowRight', true)).toBe(64);
    expect(step('ArrowLeft', true, 250)).toBe(278);
    expect([step('Home'), step('End'), step('Enter')]).toEqual([64, 278, undefined]);
    expect(edgeKeyWidth('ArrowRight', false, 110, limits, 'end')).toBe(126);
  });

  it('snaps to the automatic width within 6px', () => {
    expect(snapWidth(114, 110)).toBe(110);
    expect(snapWidth(117, 110)).toBe(117);
  });

  it('limits a drag to the column minimum and to what leaves the title 240, at most 480', () => {
    expect(widthLimits(column('state'), 110, 408)).toEqual({ min: 64, max: 278 });
    expect(widthLimits(column('severity'), 112, 900)).toEqual({ min: 52, max: 480 });
    expect(widthLimits(column('area'), 160, 200)).toEqual({ min: 80, max: 160 });
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
  const columns = gridColumns(bugs);

  it('keeps the items that hold one of the chosen values of every filtered column', () => {
    expect(ids(filterItems(items, {}, columns))).toEqual(['BUGS-1', 'BUGS-2', 'BUGS-3', 'BUGS-4']);
    expect(ids(filterItems(items, { category: ['crash', 'physics'] }, columns))).toEqual([
      'BUGS-1',
      'BUGS-2',
      'BUGS-3',
    ]);
    expect(ids(filterItems(items, { category: ['crash'], severity: ['high'] }, columns))).toEqual([
      'BUGS-1',
    ]);
    expect(ids(filterItems(items, { state: ['fixing'], category: [] }, columns))).toEqual([
      'BUGS-4',
    ]);
  });

  it('offers each value with how many items the other filters leave, dropping the empty ones', () => {
    const choices = (key: string, filters: Record<string, string[]>) =>
      filterChoices(items, column(key), filters, columns).map(({ value, count, on }) => ({
        value,
        count,
        on,
      }));

    expect(choices('category', { severity: ['high'] })).toEqual([
      { value: 'crash', count: 1, on: false },
      { value: 'physics', count: 1, on: false },
    ]);
    expect(choices('severity', { severity: ['medium'] })).toEqual([
      { value: 'high', count: 2, on: false },
      { value: 'medium', count: 0, on: true },
      { value: 'low', count: 1, on: false },
    ]);
    expect(choices('state', {})).toEqual([
      { value: 'reported', count: 3, on: false },
      { value: 'fixing', count: 1, on: false },
    ]);
  });
});

describe('free text values', () => {
  const items = [
    bug({ n: 1, fields: { area: 'Farm', category: 'crash' } }),
    bug({ n: 2, fields: { area: ' farm ' } }),
    bug({ n: 3, fields: { area: 'UI', category: 'crash' } }),
    bug({ n: 4, fields: { area: 'forest   Biome' } }),
    bug({ n: 5, fields: { area: '  ' } }),
    bug({ n: 6, fields: { category: 'crash' } }),
  ];
  const columns = gridColumns(bugs);

  it('reads a value trimmed, its inner spaces collapsed, in lowercase', () => {
    expect(normalText('  Forest \t Biome ')).toBe('forest biome');
  });

  it('takes the values from the items, A to Z, the empty one last', () => {
    expect(textValues(items, 'area')).toEqual(['farm', 'forest biome', 'ui', '']);
    expect(textValues(items.slice(0, 2), 'area')).toEqual(['farm']);
  });

  it('filters on those values, whatever the spelling', () => {
    expect(ids(filterItems(items, { area: ['farm'] }, columns))).toEqual(['BUGS-1', 'BUGS-2']);
    expect(ids(filterItems(items, { area: [''] }, columns))).toEqual(['BUGS-5', 'BUGS-6']);
  });

  it('offers each value with its count, the empty one as No <field>', () => {
    expect(filterChoices(items, column('area'), { category: ['crash'] }, columns)).toEqual([
      { value: 'farm', label: 'farm', count: 1, on: false },
      { value: 'ui', label: 'ui', count: 1, on: false },
      { value: '', label: 'No area', count: 1, on: false },
    ]);
  });

  it('sorts on the same values', () => {
    expect(ids(sortItems(items.slice(0, 4), { key: 'area', dir: 'asc' }, columns))).toEqual([
      'BUGS-1',
      'BUGS-2',
      'BUGS-4',
      'BUGS-3',
    ]);
  });
});
