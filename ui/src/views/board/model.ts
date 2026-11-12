import type { FeedEvent } from '../../activity.ts';
import { mainPath } from '../../derive/path.ts';
import { agentOf } from '../../derive/toca.ts';
import { availableColumns, normalText, sortItems, textValues } from '../../grid.ts';
import { t } from '../../i18n/i18n.ts';
import { fieldLabel } from '../../intake.ts';
import { type Folds, parentOf } from '../../nesting.ts';
import { fieldWord, stateWordIn, typeWord, valueWordIn } from '../../preset-words.ts';
import type { CollectionView, FieldView, Item, TypeView } from '../../types.ts';

// A board's model (SPEC §10.1, mock:1503-1638): its Pasos columns and steps strip, the groupings,
// filters and sort that belong to the board (every view honours them), and the entries Lista and
// Tabla draw. Pure: the views render it and the motion moves it.

export type BoardMode = 'pasos' | 'lista' | 'tabla';
export const MODES: readonly BoardMode[] = ['pasos', 'lista', 'tabla'];

export type BoardCtx = { collection: CollectionView; now: number; feed: readonly FeedEvent[] };

export type BoardSort = { key: string; dir: 'asc' | 'desc' } | null;
export type BoardFilters = Readonly<Record<string, readonly string[]>>;
export type BoardPrefsLike = { group: string; sort: BoardSort; filters: BoardFilters };

// ---- Pasos: the columns ----

// The one closed column, named for done.
export const CLOSED_COL = '__closed';

export type PasosColumn = { key: string; label: string; closed: boolean };

// One column per open state, in the order the types declare them; an off-path state only while it
// holds something; then one closed column for everything done or thrown away.
export function pasosColumns(collection: CollectionView, items: readonly Item[]): PasosColumn[] {
  const held = new Set(items.filter((it) => it.turn !== 'none').map((it) => stepKeyOf(it.state)));
  const onPath = new Set(collection.types.flatMap((type) => mainPath(type)));
  const keys: string[] = [];
  for (const type of collection.types) {
    for (const state of type.states) {
      if (state.turn === 'none' || keys.includes(state.name) || isReviewPhase(state.name)) continue;
      if (onPath.has(state.name) || held.has(state.name)) keys.push(state.name);
    }
  }
  // A state an item holds that no type declares any more still gets its column, at the end.
  for (const state of held) if (!keys.includes(state)) keys.push(state);
  return [
    ...keys.map((key) => ({ key, label: stateWordIn(collection.types, key), closed: false })),
    { key: CLOSED_COL, label: t('boardView.doneCol'), closed: true },
  ];
}

// A board made in Studio compiles a step's reviews to `<step>__review` and `<step>__yours`: they
// are the step's, counted and listed with it, never a step of their own.
const REVIEW_PHASE = /__(review|yours)$/;

function isReviewPhase(state: string): boolean {
  return REVIEW_PHASE.test(state);
}

export function stepKeyOf(state: string): string {
  return state.replace(REVIEW_PHASE, '');
}

export function columnKeyOf(item: Item, _columns?: readonly PasosColumn[]): string {
  return item.turn === 'none' ? CLOSED_COL : stepKeyOf(item.state);
}

export type Step = { key: string; label: string; count: number; you: boolean };

// The steps strip under the head: each Pasos column with its count, yours where you act.
export function stepsStrip(collection: CollectionView, items: readonly Item[]): Step[] {
  return pasosColumns(collection, items).map((col) => {
    const own = items.filter((it) => columnKeyOf(it) === col.key);
    return {
      key: col.key,
      label: col.label,
      count: own.length,
      you: own.some((it) => it.turn === 'human'),
    };
  });
}

export type Card = { item: Item; kids: Item[] };

// The cards of each column: an item whose parent is listed rides in its parent's card.
export function pasosCards(
  items: readonly Item[],
  columns: readonly PasosColumn[],
  sort: BoardSort,
  ctx: BoardCtx,
): Map<string, Card[]> {
  const here = new Set(items.map((it) => it.id));
  const top = items.filter((it) => {
    const p = parentOf(it);
    return p === undefined || !here.has(p);
  });
  const out = new Map<string, Card[]>(columns.map((c) => [c.key, []]));
  for (const it of sortBoard(top, sort, ctx)) {
    const kids = descendants(it, items);
    out.get(columnKeyOf(it))?.push({ item: it, kids });
  }
  return out;
}

function descendants(parent: Item, items: readonly Item[]): Item[] {
  const out: Item[] = [];
  const walk = (id: string, seen: Set<string>) => {
    for (const it of items) {
      if (parentOf(it) !== id || seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      walk(it.id, seen);
    }
  };
  walk(parent.id, new Set([parent.id]));
  return out;
}

// ---- the mode and grouping a board starts from ----

export function defaultMode(collection: CollectionView): BoardMode {
  const kind = collection.view.kind;
  return kind === 'grid' ? 'tabla' : kind === 'board' ? 'pasos' : 'lista';
}

// Turn is every preset's implicit grouping; the board reads best by step unless the preset says.
export function defaultGroup(collection: CollectionView): string {
  const by = collection.view.groupBy;
  return by && by !== 'turn' && groupOptions(collection).some((o) => o.key === by) ? by : 'state';
}

export type GroupOption = { key: string; label: string };

// ---- the motives a board discards with ----

// A Studio board with discard motives compiles each motive to a closed state `dropped__<id>`,
// labelled with the motive's name; plain `dropped` keeps the discards from before the motives.
const MOTIVE_PREFIX = 'dropped__';
export const MOTIVE_KEY = 'motive';
export const NO_MOTIVE = 'dropped';

export type Motive = { id: string; name: string };

export function motivesOf(collection: CollectionView): Motive[] {
  const [first] = collection.types;
  return (first?.states ?? []).flatMap((state) =>
    state.name.startsWith(MOTIVE_PREFIX) && state.closes === 'discarded'
      ? [
          {
            id: state.name.slice(MOTIVE_PREFIX.length),
            name: stateWordIn(collection.types, state.name),
          },
        ]
      : [],
  );
}

// The motive an item was discarded with, plain `dropped` for a discard without one, '' otherwise.
export function motiveOfItem(item: Item): string {
  if (item.closes !== 'discarded') return '';
  return item.state.startsWith(MOTIVE_PREFIX) ? item.state.slice(MOTIVE_PREFIX.length) : NO_MOTIVE;
}

// What an ended item says under Turno: its motive's name, or "—".
export function endedTurnText(item: Item, collection: CollectionView): string {
  const motive = motiveOfItem(item);
  if (!motive || motive === NO_MOTIVE) return '—';
  return motivesOf(collection).find((m) => m.id === motive)?.name ?? '—';
}

const ONE_LINE = ['enum', 'severity', 'text'];

// The one-line fields every type of the board has, in the order the first declares them.
function oneLineFields(collection: CollectionView): FieldView[] {
  const [first, ...rest] = collection.types;
  return (first?.fields ?? []).filter(
    ({ name, module }) =>
      name !== 'title' &&
      ONE_LINE.includes(module) &&
      rest.every((type) => type.fields.some((f) => f.name === name)),
  );
}

export function fieldName(collection: CollectionView, key: string): string {
  return collection.types.map((type) => fieldWord(type, key)).find(Boolean) ?? fieldLabel(key);
}

const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

export function groupOptions(collection: CollectionView): GroupOption[] {
  return [
    { key: 'state', label: t('boardView.group.state') },
    { key: 'turn', label: t('boardView.group.turn') },
    { key: 'who', label: t('boardView.group.who') },
    ...(collection.types.length > 1 ? [{ key: 'type', label: t('boardView.group.type') }] : []),
    ...oneLineFields(collection).map((f) => ({
      key: f.name,
      label: lower(fieldName(collection, f.name)),
    })),
    ...(motivesOf(collection).length
      ? [{ key: MOTIVE_KEY, label: t('boardView.group.motive') }]
      : []),
    { key: 'none', label: t('boardView.group.none') },
  ];
}

export function filterKeys(collection: CollectionView): GroupOption[] {
  return groupOptions(collection).filter((o) => o.key !== 'none');
}

// ---- values ----

const fieldOf = (collection: CollectionView, key: string): FieldView | undefined =>
  collection.types.flatMap((type) => type.fields).find((f) => f.name === key);

// The value an item holds for a grouping or a filter.
export function holds(item: Item, key: string, ctx: BoardCtx): string {
  if (key === 'state') return columnKeyOf(item);
  if (key === 'turn') return item.turn;
  if (key === 'type') return item.type;
  if (key === MOTIVE_KEY) return motiveOfItem(item);
  if (key === 'who') {
    if (item.turn === 'human') return 'you';
    if (item.turn === 'none') return item.closes === 'discarded' ? 'dropped' : 'done';
    return agentOf(item, ctx.feed) ?? '';
  }
  const raw = item.fields[key] ?? '';
  return fieldOf(ctx.collection, key)?.module === 'text' ? normalText(raw) : raw;
}

// A value as the menus and tokens say it.
export function valueText(key: string, value: string, ctx: BoardCtx): string {
  const { collection } = ctx;
  if (key === 'state') {
    return value === CLOSED_COL ? t('boardView.doneCol') : stateWordIn(collection.types, value);
  }
  if (key === 'turn') {
    return value === 'human'
      ? t('boardView.turn.human')
      : value === 'agent'
        ? t('boardView.turn.agent')
        : t('boardView.turn.none');
  }
  if (key === 'who') {
    if (value === 'you') return t('boardView.who.you');
    if (value === 'done') return t('boardView.who.done');
    if (value === 'dropped') return t('boardView.who.dropped');
    return value || t('boardView.who.nobody');
  }
  if (key === 'type') {
    const type = collection.types.find((ty) => ty.name === value);
    return typeWord(type, value);
  }
  if (key === MOTIVE_KEY) {
    if (value === '') return '—';
    if (value === NO_MOTIVE) return t('boardView.motive.none');
    return motivesOf(collection).find((m) => m.id === value)?.name ?? value;
  }
  return value === ''
    ? t('section.noValue', { group: lower(fieldName(collection, key)) })
    : valueWordIn(collection.types, key, value);
}

// Every value a key can take, in the order the menus list them.
function orderOf(key: string, items: readonly Item[], ctx: BoardCtx): string[] {
  const { collection } = ctx;
  if (key === 'state') return pasosColumns(collection, items).map((c) => c.key);
  if (key === 'turn') return ['human', 'agent', 'none'];
  if (key === 'type') return collection.types.map((ty) => ty.name);
  if (key === MOTIVE_KEY) return [...motivesOf(collection).map((m) => m.id), NO_MOTIVE, ''];
  if (key === 'who') {
    const agents = [...new Set(items.map((it) => holds(it, 'who', ctx)))]
      .filter((v) => !['you', 'done', 'dropped', ''].includes(v))
      .sort((a, b) => a.localeCompare(b));
    return ['you', ...agents, '', 'done', 'dropped'];
  }
  const field = fieldOf(collection, key);
  if (field?.module === 'text') return textValues(items, key);
  const values = field?.module === 'severity' ? [...(field.values ?? [])].reverse() : field?.values;
  const declared = values ?? [];
  const stale = [...new Set(items.map((it) => holds(it, key, ctx)))].filter(
    (v) => v !== '' && !declared.includes(v),
  );
  return [...declared, ...stale, ''];
}

export function applyFilters(items: readonly Item[], filters: BoardFilters, ctx: BoardCtx) {
  return items.filter((it) => passes(it, filters, ctx));
}

function passes(item: Item, filters: BoardFilters, ctx: BoardCtx, skip?: string): boolean {
  return Object.entries(filters).every(
    ([key, chosen]) => key === skip || !chosen.length || chosen.includes(holds(item, key, ctx)),
  );
}

export type Choice = { value: string; label: string; count: number; on: boolean };

// A key's values with how many items each would show beside the other filters; a value with nothing
// to show drops out, unless it is chosen.
export function filterChoices(
  items: readonly Item[],
  key: string,
  filters: BoardFilters,
  ctx: BoardCtx,
): Choice[] {
  const others = items.filter((it) => passes(it, filters, ctx, key));
  const chosen = filters[key] ?? [];
  const order = orderOf(key, items, ctx);
  const values = [...order, ...chosen.filter((v) => !order.includes(v))];
  return values
    .map((value) => ({
      value,
      label: valueText(key, value, ctx),
      count: others.filter((it) => holds(it, key, ctx) === value).length,
      on: chosen.includes(value),
    }))
    .filter(({ count, on }) => count > 0 || on);
}

// ---- sort ----

const time = (it: Item) => Date.parse(it.updatedAt);

// Open work oldest waiting first, then closed work newest first.
function defaultOrder(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => {
    const ca = a.turn === 'none' ? 1 : 0;
    const cb = b.turn === 'none' ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return ca ? time(b) - time(a) : time(a) - time(b);
  });
}

export function sortBoard(items: readonly Item[], sort: BoardSort, ctx: BoardCtx): Item[] {
  const base = defaultOrder(items);
  if (!sort) return base;
  if (sort.key === 'who') {
    const sign = sort.dir === 'asc' ? 1 : -1;
    return base.sort((a, b) => sign * holds(a, 'who', ctx).localeCompare(holds(b, 'who', ctx)));
  }
  return sortItems(base, sort, availableColumns(ctx.collection));
}

// ---- groups ----

export type Group = { key: string; title: string; items: Item[] };

const GROUP_TITLE_TURN = {
  human: 'section.human',
  agent: 'section.agent',
  none: 'section.none',
} as const;

// The groups a grouping makes, in order, only those that hold something; each sorted.
export function groupBoard(
  items: readonly Item[],
  by: string,
  ctx: BoardCtx,
  sort: BoardSort = null,
): Group[] {
  const sorted = sortBoard(items, sort, ctx);
  if (by === 'none') return [{ key: 'all', title: '', items: sorted }];
  const of = (it: Item) => {
    const v = holds(it, by, ctx);
    return by === 'who' && (v === 'done' || v === 'dropped') ? 'closed' : v;
  };
  const order =
    by === 'who'
      ? [...orderOf('who', items, ctx).filter((v) => v !== 'done' && v !== 'dropped'), 'closed']
      : orderOf(by, items, ctx);
  const title = (key: string) => {
    if (by === 'turn')
      return t(GROUP_TITLE_TURN[key as keyof typeof GROUP_TITLE_TURN] ?? 'section.none');
    if (by === 'who') {
      if (key === 'closed') return t('section.none');
      if (key === 'you') return t('boardView.whoGroup.you');
      return key || t('boardView.whoGroup.nobody');
    }
    const text = valueText(by, key, ctx);
    return by === 'state' || by === MOTIVE_KEY ? text : text.replace(/^./, (c) => c.toUpperCase());
  };
  return order.flatMap((key) => {
    const own = sorted.filter((it) => of(it) === key);
    return own.length ? [{ key, title: title(key), items: own }] : [];
  });
}

// ---- the entries of Lista and Tabla ----

export type Entry =
  | { kind: 'group'; key: string; title: string; count: number }
  | {
      kind: 'row';
      item: Item;
      sec: string;
      child: boolean;
      // A parent's nested children (all its descendants listed under it).
      kids: number;
      folded: boolean;
      // A child of a folded parent: kept, out of sight, so a fold never changes the rows.
      hidden: boolean;
    };

const isSettled = (it: Item) =>
  it.children !== undefined && it.children.total > 0 && it.children.open === 0;

export function isFolded(it: Item, folds: Folds): boolean {
  return isSettled(it) ? !folds.expanded.has(it.id) : folds.collapsed.has(it.id);
}

export function boardEntries(
  all: readonly Item[],
  prefs: BoardPrefsLike,
  folds: Folds,
  ctx: BoardCtx,
): { entries: Entry[]; shown: number; total: number } {
  const its = applyFilters(all, prefs.filters, ctx);
  const nest = prefs.group === 'state' && !prefs.sort;
  const here = new Set(its.map((it) => it.id));
  const top = nest
    ? its.filter((it) => {
        const p = parentOf(it);
        return p === undefined || !here.has(p);
      })
    : its;
  const entries: Entry[] = [];
  for (const g of groupBoard(top, prefs.group, ctx, prefs.sort)) {
    const kidsOf = new Map(g.items.map((it) => [it.id, nest ? descendants(it, its) : []]));
    const count = g.items.reduce((n, it) => n + 1 + (kidsOf.get(it.id)?.length ?? 0), 0);
    if (g.title) entries.push({ kind: 'group', key: g.key, title: g.title, count });
    for (const it of g.items) {
      const kids = sortBoard(kidsOf.get(it.id) ?? [], null, ctx);
      const folded = kids.length > 0 && isFolded(it, folds);
      entries.push({
        kind: 'row',
        item: it,
        sec: g.key,
        child: false,
        kids: kids.length,
        folded,
        hidden: false,
      });
      for (const k of kids) {
        entries.push({
          kind: 'row',
          item: k,
          sec: g.key,
          child: true,
          kids: 0,
          folded: false,
          hidden: folded,
        });
      }
    }
  }
  return { entries, shown: its.length, total: all.length };
}

// ---- what a row says ----

// The round an item is in: one, plus every time you sent it back to an agent with your notes.
export function roundOf(
  item: Item,
  feed: readonly FeedEvent[],
  type: TypeView | undefined,
): number {
  const agentStates = new Set(
    (type?.states ?? []).filter((s) => s.turn === 'agent').map((s) => s.name),
  );
  let n = 1;
  for (const e of feed) {
    if (e.itemId !== item.id || e.type !== 'transitioned' || e.actor.kind !== 'human') continue;
    const reason = typeof e.data.reason === 'string' ? e.data.reason.trim() : '';
    if (reason && agentStates.has(String(e.data.to))) n += 1;
  }
  return n;
}

// A signal worth a glance in the meta line: the first enum field set off its default.
export function signalOf(item: Item, collection: CollectionView): string | null {
  for (const f of oneLineFields(collection)) {
    if (f.module !== 'enum') continue;
    const v = item.fields[f.name];
    if (v && v !== f.default) return valueWordIn(collection.types, f.name, v);
  }
  return null;
}

// A severity field's value as bars: 0 (lowest) to 3.
export function severityOf(item: Item, collection: CollectionView): number | null {
  const f = oneLineFields(collection).find((x) => x.module === 'severity');
  if (!f) return null;
  const v = item.fields[f.name];
  const values = f.values ?? [];
  const i = v ? values.indexOf(v) : -1;
  if (i < 0) return null;
  return Math.round((i * 3) / Math.max(1, values.length - 1));
}

export function severityField(collection: CollectionView): FieldView | undefined {
  return oneLineFields(collection).find((x) => x.module === 'severity');
}
