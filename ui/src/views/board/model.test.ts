import { beforeEach, describe, expect, it } from 'vitest';
import { compileBoard } from '../../../../src/core/board/compile.ts';
import { creatures, errores as erroresBoard } from '../../../../src/core/board/testing.ts';
import { typeViews } from '../../../../src/core/views.ts';
import type { FeedEvent } from '../../activity.ts';
import { agent, ago, inMinutes, item, moved, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { stateWordIn } from '../../preset-words.ts';
import type { CollectionView, Item } from '../../types.ts';
import {
  applyFilters,
  type BoardCtx,
  boardEntries,
  CLOSED_COL,
  columnKeyOf,
  defaultGroup,
  defaultMode,
  filterChoices,
  filterKeys,
  groupBoard,
  groupOptions,
  holds,
  motivesOf,
  pasosCards,
  pasosColumns,
  roundOf,
  signalOf,
  sortBoard,
  stepsStrip,
  tablaCells,
  valueText,
} from './model.ts';

const bug = officialType('bug-triage');
const tasks = officialType('tasks');

const errores: CollectionView = {
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  icon: 'bug',
  types: [bug],
  view: { kind: 'grid', groupBy: 'turn', columns: ['id', 'title', 'category', 'severity'] },
};
const tareas: CollectionView = {
  name: 'Tareas',
  prefix: 'TSK',
  preset: 'tasks',
  icon: null,
  types: [{ ...tasks, name: 'item' }],
  view: { kind: 'list', groupBy: 'turn', columns: ['id', 'title', 'state', 'who', 'age'] },
};

const ctx = (collection = errores, feed: FeedEvent[] = []): BoardCtx => ({
  collection,
  now: NOW,
  feed,
});

const child = (id: string, parent: string, o: Partial<Item> = {}) =>
  item({ id, relations: [{ kind: 'parent', id: parent }] as NonNullable<Item['relations']>, ...o });

beforeEach(() => setLanguage('en'));

describe('a board made in Studio', () => {
  const preset = compileBoard('bcria', 1, creatures());
  const [type] = typeViews(preset.types);
  const criaturas: CollectionView = {
    name: 'Criaturas',
    prefix: 'CRI',
    preset: 'bcria',
    icon: null,
    types: [type as unknown as CollectionView['types'][number]],
    view: { kind: 'list', groupBy: 'state', columns: ['id', 'title'] },
  };

  it('shows its steps, a review counted in the step it reviews, never a column of its own', () => {
    const items = [
      item({ id: 'CRI-1', collection: 'Criaturas', state: 'sconcept__review', turn: 'human' }),
      item({ id: 'CRI-2', collection: 'Criaturas', state: 'sanimate__yours', turn: 'human' }),
    ];
    expect(pasosColumns(criaturas, items).map(({ key, label }) => `${key}:${label}`)).toEqual([
      'sconcept:Concepto',
      'sanimate:Animar',
      'spolish:Pulir',
      `${CLOSED_COL}:Done`,
    ]);
    expect(stepsStrip(criaturas, items).map(({ count }) => count)).toEqual([1, 1, 0, 0]);
    expect(groupBoard(items, 'state', ctx(criaturas)).map(({ title }) => title)).toEqual([
      'Concepto',
      'Animar',
    ]);
  });
});

describe('the Pasos columns', () => {
  it('lists every open state in declaration order, leaves out empty off-path ones, and closes with one Done column', () => {
    const items = [
      item({ id: 'A', state: 'reported' }),
      item({ id: 'B', state: 'fixing', turn: 'agent' }),
      item({ id: 'C', state: 'fixed', turn: 'none', closes: 'done' }),
    ];
    const cols = pasosColumns(errores, items);
    expect(cols.map((c) => c.key)).toEqual([
      'reported',
      'accepted',
      'fixing',
      'verify',
      CLOSED_COL,
    ]);
    expect(cols.at(-1)).toMatchObject({ closed: true, label: 'Done' });
  });

  it('keeps an off-path state that holds items, in its declared place', () => {
    const items = [item({ id: 'A', state: 'needs_info', turn: 'agent' })];
    expect(pasosColumns(errores, items).map((c) => c.key)).toEqual([
      'reported',
      'needs_info',
      'accepted',
      'fixing',
      'verify',
      CLOSED_COL,
    ]);
  });

  it('puts every closed item, done or discarded, in the Done column', () => {
    const cols = pasosColumns(errores, []);
    const dropped = item({ id: 'A', state: 'rejected', turn: 'none', closes: 'discarded' });
    expect(columnKeyOf(dropped, cols)).toBe(CLOSED_COL);
    expect(columnKeyOf(item({ id: 'B', state: 'verify' }), cols)).toBe('verify');
  });

  it('names each column with the preset word in the language on screen', () => {
    setLanguage('es');
    const cols = pasosColumns(errores, []);
    expect(cols.map((c) => c.label)).toEqual([
      'Reportado',
      'Aceptado',
      'En arreglo',
      'A verificar',
      'Hecho',
    ]);
  });

  it('draws the steps strip from the columns, with counts, marked yours where you act', () => {
    const items = [
      item({ id: 'A', state: 'verify' }),
      item({ id: 'B', state: 'fixing', turn: 'agent' }),
      item({ id: 'C', state: 'fixing', turn: 'agent' }),
    ];
    const strip = stepsStrip(errores, items);
    expect(strip.map((s) => [s.key, s.count, s.you])).toEqual([
      ['reported', 0, false],
      ['accepted', 0, false],
      ['fixing', 2, false],
      ['verify', 1, true],
      [CLOSED_COL, 0, false],
    ]);
  });

  it('lays out cards per column, children inside their parent card, sorted like the list', () => {
    const items = [
      item({ id: 'P', state: 'fixing', turn: 'agent', updatedAt: ago(50) }),
      child('K1', 'P', { state: 'verify' }),
      child('K2', 'P', { state: 'fixed', turn: 'none', closes: 'done' }),
      item({ id: 'Q', state: 'fixing', turn: 'agent', updatedAt: ago(90) }),
    ];
    const cols = pasosColumns(errores, items);
    const cards = pasosCards(items, cols, null, ctx());
    expect(cards.get('fixing')?.map((c) => [c.item.id, c.kids.map((k) => k.id)])).toEqual([
      ['Q', []],
      ['P', ['K1', 'K2']],
    ]);
    expect(cards.get('verify')).toEqual([]);
  });

  it('shows a child as a card of its own when its parent is filtered out', () => {
    const items = [child('K1', 'P', { state: 'verify' })];
    const cols = pasosColumns(errores, items);
    expect(
      pasosCards(items, cols, null, ctx())
        .get('verify')
        ?.map((c) => c.item.id),
    ).toEqual(['K1']);
  });
});

describe('the board mode and grouping it starts from', () => {
  it('opens a grid preset in Tabla, a board preset in Pasos, a list preset in Lista', () => {
    expect(defaultMode(errores)).toBe('tabla');
    expect(defaultMode(tareas)).toBe('lista');
    expect(defaultMode({ ...tareas, view: { ...tareas.view, kind: 'board' } })).toBe('pasos');
  });

  it('groups by step unless the preset names another grouping than turn', () => {
    expect(defaultGroup(errores)).toBe('state');
    expect(defaultGroup({ ...errores, view: { ...errores.view, groupBy: 'severity' } })).toBe(
      'severity',
    );
  });

  it('offers step, turn, who, the one-line fields and no grouping', () => {
    expect(groupOptions(errores).map((o) => o.key)).toEqual([
      'state',
      'turn',
      'who',
      'environment',
      'severity',
      'category',
      'area',
      'none',
    ]);
    expect(groupOptions(errores).map((o) => o.label)).toContain('no grouping');
  });
});

describe('values, filters and sorting: every view honours them', () => {
  const feed = [moved('B', 'fixing', agent('mender'))];
  const items = [
    item({ id: 'A', state: 'verify', fields: { category: 'crash', severity: 'high' } }),
    item({ id: 'B', state: 'fixing', turn: 'agent', fields: { category: 'visual' } }),
    item({ id: 'C', state: 'rejected', turn: 'none', closes: 'discarded' }),
    item({
      id: 'D',
      state: 'fixing',
      turn: 'agent',
      lease: { holder: 'kiln', expiresAt: inMinutes(20) },
      fields: { severity: 'critical' },
    }),
  ];

  it('reads who has an item: you, its agent, done or dropped', () => {
    const c = ctx(errores, feed);
    expect(items.map((it) => holds(it, 'who', c))).toEqual(['you', 'mender', 'dropped', 'kiln']);
    expect(items.map((it) => holds(it, 'turn', c))).toEqual(['human', 'agent', 'none', 'agent']);
    expect(holds(items[2] as Item, 'state', c)).toBe(CLOSED_COL);
  });

  it('filters by step, turn, who and fields', () => {
    const c = ctx(errores, feed);
    expect(applyFilters(items, { who: ['kiln', 'you'] }, c).map((i) => i.id)).toEqual(['A', 'D']);
    expect(
      applyFilters(items, { state: ['fixing'], category: ['visual'] }, c).map((i) => i.id),
    ).toEqual(['B']);
    expect(applyFilters(items, {}, c)).toHaveLength(4);
  });

  it('counts each value over the board, in the order the menus list them', () => {
    const c = ctx(errores, feed);
    const sev = filterChoices(items, 'severity', { severity: ['high'] }, c);
    expect(sev.map((v) => [v.value, v.count, v.on])).toEqual([
      ['critical', 1, false],
      ['high', 1, true],
      ['', 2, false],
    ]);
    expect(sev.at(-1)?.label).toBe('Severity: none');
    expect(filterChoices(items, 'state', {}, c).map((v) => [v.value, v.count])).toEqual([
      ['fixing', 2],
      ['verify', 1],
      [CLOSED_COL, 1],
    ]);
  });

  it('offers to filter by step, turn, who and the one-line fields', () => {
    expect(filterKeys(errores).map((k) => k.key)).toEqual([
      'state',
      'turn',
      'who',
      'environment',
      'severity',
      'category',
      'area',
    ]);
  });

  it('sorts open work oldest first and closed work last, newest first, by default', () => {
    const list = [
      item({ id: 'A', updatedAt: ago(10) }),
      item({ id: 'B', updatedAt: ago(90) }),
      item({ id: 'C', turn: 'none', state: 'fixed', updatedAt: ago(500) }),
      item({ id: 'D', turn: 'none', state: 'fixed', updatedAt: ago(20) }),
    ];
    expect(sortBoard(list, null, ctx()).map((i) => i.id)).toEqual(['B', 'A', 'D', 'C']);
  });

  it('sorts by a column, empty cells last, ties in the default order', () => {
    const c = ctx(errores, feed);
    const bySev = sortBoard(items, { key: 'severity', dir: 'desc' }, c).map((i) => i.id);
    expect(bySev.slice(0, 2)).toEqual(['D', 'A']);
    expect(sortBoard(items, { key: 'who', dir: 'asc' }, c).map((i) => i.id)).toEqual([
      'C',
      'D',
      'B',
      'A',
    ]);
  });
});

describe('the groups of Lista and Tabla', () => {
  const items = [
    item({ id: 'A', state: 'verify' }),
    item({
      id: 'B',
      state: 'fixing',
      turn: 'agent',
      lease: { holder: 'kiln', expiresAt: inMinutes(9) },
    }),
    item({ id: 'C', state: 'fixed', turn: 'none', closes: 'done' }),
  ];

  it('groups by step in the Pasos order, only the steps that hold something', () => {
    const groups = groupBoard(items, 'state', ctx());
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['fixing', ['B']],
      ['verify', ['A']],
      [CLOSED_COL, ['C']],
    ]);
  });

  it('groups by turn and by who, closed work last', () => {
    expect(groupBoard(items, 'turn', ctx()).map((g) => g.title)).toEqual([
      'Waiting for you',
      'With agents',
      'Closed',
    ]);
    expect(groupBoard(items, 'who', ctx()).map((g) => g.title)).toEqual(['You', 'kiln', 'Closed']);
  });

  it('lists everything in one untitled group without grouping', () => {
    expect(groupBoard(items, 'none', ctx())).toEqual([
      { key: 'all', title: '', items: sortBoard(items, null, ctx()) },
    ]);
  });
});

describe('the entries of a grouped list', () => {
  const items = [
    item({
      id: 'P',
      state: 'fixing',
      turn: 'agent',
      children: { total: 2, open: 2, done: 0, discarded: 0 },
    }),
    child('K1', 'P', { state: 'verify' }),
    child('K2', 'P', { state: 'fixing', turn: 'agent' }),
    item({ id: 'Q', state: 'verify' }),
  ];
  const none = { collapsed: new Set<string>(), expanded: new Set<string>() };

  it('nests children under their parent when grouped by step, counting them in its group', () => {
    const { entries } = boardEntries(
      items,
      { group: 'state', sort: null, filters: {} },
      none,
      ctx(),
    );
    expect(
      entries.map((e) =>
        e.kind === 'group' ? `#${e.key}:${e.count}` : `${e.child ? '  ' : ''}${e.item.id}`,
      ),
    ).toEqual(['#fixing:3', 'P', '  K1', '  K2', '#verify:1', 'Q']);
    const P = entries.find((e) => e.kind === 'row' && e.item.id === 'P');
    expect(P).toMatchObject({ kids: 2, folded: false });
  });

  it('keeps folded children in the entries, hidden, so a fold never changes the rows', () => {
    const folds = { collapsed: new Set(['P']), expanded: new Set<string>() };
    const { entries } = boardEntries(
      items,
      { group: 'state', sort: null, filters: {} },
      folds,
      ctx(),
    );
    const rows = entries.filter((e) => e.kind === 'row');
    expect(rows.map((e) => [e.item.id, e.hidden])).toEqual([
      ['P', false],
      ['K1', true],
      ['K2', true],
      ['Q', false],
    ]);
  });

  it('folds a parent whose children are all closed, until you unfold it', () => {
    const settled = [
      item({ id: 'P', state: 'verify', children: { total: 1, open: 0, done: 1, discarded: 0 } }),
      child('K', 'P', { state: 'fixed', turn: 'none', closes: 'done' }),
    ];
    const pre = { group: 'state', sort: null, filters: {} };
    const folded = boardEntries(settled, pre, none, ctx()).entries;
    expect(folded.find((e) => e.kind === 'row' && e.item.id === 'K')).toMatchObject({
      hidden: true,
    });
    const open = boardEntries(
      settled,
      pre,
      { collapsed: new Set(), expanded: new Set(['P']) },
      ctx(),
    );
    expect(open.entries.find((e) => e.kind === 'row' && e.item.id === 'K')).toMatchObject({
      hidden: false,
    });
  });

  it('lists flat under any other grouping or a sort', () => {
    const sorted = boardEntries(
      items,
      { group: 'state', sort: { key: 'id', dir: 'asc' }, filters: {} },
      none,
      ctx(),
    );
    expect(sorted.entries.some((e) => e.kind === 'row' && e.child)).toBe(false);
    const byTurn = boardEntries(items, { group: 'turn', sort: null, filters: {} }, none, ctx());
    expect(byTurn.entries.some((e) => e.kind === 'row' && e.child)).toBe(false);
  });

  it('says how many it shows of how many', () => {
    const r = boardEntries(
      items,
      { group: 'state', sort: null, filters: { state: ['verify'] } },
      none,
      ctx(),
    );
    expect([r.shown, r.total]).toEqual([2, 4]);
  });
});

describe('what a board row says', () => {
  it('counts the rounds an item went back to an agent with your notes', () => {
    const feed = [
      moved(
        'A',
        'fixing',
        { kind: 'human', name: 'you' },
        { reason: 'still flickers', from: 'verify' },
      ),
      moved('A', 'verify', agent('mender'), { reason: 'fixed' }),
      moved('A', 'fixing', { kind: 'human', name: 'you' }, { reason: 'not yet', from: 'verify' }),
    ];
    expect(roundOf(item({ id: 'A' }), feed, bug)).toBe(3);
    expect(roundOf(item({ id: 'B' }), feed, bug)).toBe(1);
    expect(roundOf({ ...item({ id: 'A' }), round: 1 }, feed, bug)).toBe(1);
  });

  it('shows the first enum field that is off its default', () => {
    const t = tareas.types[0];
    expect(signalOf(item({ id: 'A', fields: { priority: 'medium' } }), tareas)).toBeNull();
    expect(signalOf(item({ id: 'A', fields: { priority: 'high' } }), tareas)).toBe('High');
    expect(t).toBeDefined();
    expect(signalOf(item({ id: 'B', fields: { category: 'crash' } }), errores)).toBe('crash');
  });
});

// A board with discard motives (Rechazado, Duplicado): each is a closed state dropped__<id>, its
// label the motive's name. The board groups and filters by motive, and plain "dropped" holds the
// discards from before the motives.
describe('the motives a board discards with', () => {
  const preset = compileBoard('berr', 1, erroresBoard());
  const [type] = typeViews(preset.types);
  const bugs: CollectionView = {
    name: 'Errores',
    prefix: 'ERR',
    preset: 'berr',
    icon: null,
    types: [type as unknown as CollectionView['types'][number]],
    view: { kind: 'grid', groupBy: 'state', columns: ['id', 'title', 'state', 'who'] },
  };
  const c = ctx(bugs);
  const items = [
    item({ id: 'E-1', collection: 'Errores', state: 'sfill', turn: 'agent' }),
    item({
      id: 'E-2',
      collection: 'Errores',
      state: 'dropped__duplicate',
      turn: 'none',
      closes: 'discarded',
    }),
    item({
      id: 'E-3',
      collection: 'Errores',
      state: 'dropped__rejected',
      turn: 'none',
      closes: 'discarded',
    }),
    item({ id: 'E-4', collection: 'Errores', state: 'dropped', turn: 'none', closes: 'discarded' }),
    item({ id: 'E-5', collection: 'Errores', state: 'done', turn: 'none', closes: 'done' }),
  ];

  it('are read from the board’s closed states, in its order, by their names', () => {
    expect(motivesOf(bugs)).toEqual([
      { id: 'rejected', name: 'Rechazado' },
      { id: 'duplicate', name: 'Duplicado' },
    ]);
    expect(motivesOf(errores)).toEqual([]);
  });

  it('are what an item holds: its motive, plain dropped, or nothing while it is open or done', () => {
    expect(items.map((it) => holds(it, 'motive', c))).toEqual([
      '',
      'duplicate',
      'rejected',
      'dropped',
      '',
    ]);
  });

  it('group the board in the board’s order, by name', () => {
    const groups = groupBoard(items, 'motive', c);
    expect(groups.map((g) => [g.title, g.items.map((it) => it.id)])).toEqual([
      ['Rechazado', ['E-3']],
      ['Duplicado', ['E-2']],
      ['No motive', ['E-4']],
      ['—', ['E-1', 'E-5']],
    ]);
  });

  it('read in Tabla’s step column, never in its who column', () => {
    setLanguage('es');
    expect(items.map((it) => tablaCells(it, c))).toEqual([
      { step: stateWordIn(bugs.types, 'sfill'), ended: false, age: '30 min' },
      { step: 'Duplicado', ended: true, age: '30 min' },
      { step: 'Rechazado', ended: true, age: '30 min' },
      { step: 'Descartado', ended: true, age: '30 min' },
      { step: stateWordIn(bugs.types, 'done'), ended: true, age: '30 min' },
    ]);
  });

  it('give Tabla’s age column the age, a lease’s time left going to who’s tooltip', () => {
    setLanguage('es');
    const held = item({
      id: 'E-6',
      collection: 'Errores',
      state: 'sfill',
      turn: 'agent',
      updatedAt: ago(3),
      lease: { holder: 'scout', expiresAt: inMinutes(112) },
    });
    const cells = tablaCells(held, c);

    expect(cells.age).toBe('3 min');
    expect(cells.lease).toMatch(/^quedan 1 h 52 min · .*scout/);
    expect(tablaCells(items[0] as Item, c).lease).toBeUndefined();
  });

  it('are a grouping and a filter only on a board that has them', () => {
    expect(groupOptions(bugs).some((o) => o.key === 'motive')).toBe(true);
    expect(filterKeys(bugs).some((o) => o.key === 'motive')).toBe(true);
    expect(groupOptions(errores).some((o) => o.key === 'motive')).toBe(false);
    const only = applyFilters(items, { motive: ['duplicate'] }, c);
    expect(only.map((it) => it.id)).toEqual(['E-2']);
    expect(valueText('motive', 'duplicate', c)).toBe('Duplicado');
  });
});
