import type { CollectionView, FieldView, Item } from './types.ts';

// The grid: a collection's items as a table, one row each, its columns from the preset
// (`view.columns`) or the viewer's choice among every column the collection offers. Every row starts
// with the turn node on its lanes and a select box, which are not columns. Only the title flexes;
// the other columns have a width of their own, automatic or the viewer's.

export type ColumnKind = 'id' | 'title' | 'state' | 'type' | 'who' | 'age' | FieldKind;

type FieldKind = 'enum' | 'severity' | 'text';

// values: what an enum, severity, state or type column can hold, in the order the menus list them
// (severity from the worst down). A text column has none: its values come from the items.
export type GridColumn = {
  key: string;
  kind: ColumnKind;
  label: string;
  field?: FieldView;
  values?: string[];
  // The id column: how many characters its ids take (the prefix, a dash and three digits).
  chars?: number;
};

export type SortDirection = 'asc' | 'desc';

export type Sort = { key: string; dir: SortDirection } | null;

// The chosen values of each filtered column: an item passes when it holds one of them. A text
// column's values are kept as normalText reads them.
export type Filters = Readonly<Record<string, readonly string[]>>;

// The widths the viewer gave columns, by key; a column without one is automatic.
export type Widths = Readonly<Record<string, number>>;

const BUILT_INS = ['id', 'title', 'state', 'type', 'who', 'age'] as const;

const BUILT_IN: Record<string, ColumnKind> = Object.fromEntries(BUILT_INS.map((key) => [key, key]));

// Shown whatever the viewer chooses.
export const ALWAYS: readonly string[] = ['id', 'title'];

const ONE_LINE: Record<string, FieldKind> = { enum: 'enum', severity: 'severity', text: 'text' };

function fieldOf(collection: CollectionView, name: string): FieldView | undefined {
  for (const type of collection.types) {
    const found = type.fields.find((field) => field.name === name);
    if (found) return found;
  }
  return undefined;
}

function statesOf(collection: CollectionView): string[] {
  return [...new Set(collection.types.flatMap((type) => type.states.map(({ name }) => name)))];
}

function columnOf(collection: CollectionView, key: string): GridColumn | undefined {
  const builtIn = BUILT_IN[key];
  if (builtIn === 'state') return { key, kind: builtIn, label: key, values: statesOf(collection) };
  if (builtIn === 'type') {
    return { key, kind: builtIn, label: key, values: collection.types.map(({ name }) => name) };
  }
  if (builtIn === 'id')
    return { key, kind: builtIn, label: key, chars: collection.prefix.length + 4 };
  if (builtIn) return { key, kind: builtIn, label: key };
  const field = fieldOf(collection, key);
  const kind = field ? ONE_LINE[field.module] : undefined;
  if (!field || !kind) return undefined;
  const values = kind === 'severity' ? [...(field.values ?? [])].reverse() : field.values;
  return { key, kind, label: key, field, ...(kind !== 'text' && values ? { values } : {}) };
}

// The preset's columns; one whose field no type declares any more (the preset changed) is dropped.
export function gridColumns(collection: CollectionView): GridColumn[] {
  return collection.view.columns.flatMap((key) => {
    const column = columnOf(collection, key);
    return column ? [column] : [];
  });
}

const isField = (key: string) => BUILT_IN[key] === undefined;

// Every column the collection can draw: the built-ins and each one-line field its types declare.
// None is reordered: the preset's columns keep their order, id goes first, a field the preset does
// not list goes after its last field, a built-in before who (who before age, age last).
export function availableColumns(collection: CollectionView): GridColumn[] {
  const keys = gridColumns(collection).map(({ key }) => key);
  const fields = [
    ...new Set(collection.types.flatMap((type) => type.fields.map(({ name }) => name))),
  ].filter((name) => isField(name) && columnOf(collection, name));
  const place = (key: string, index: number) => keys.splice(index, 0, key);
  if (!keys.includes('id')) place('id', 0);
  for (const name of fields.filter((name) => !keys.includes(name))) {
    const last = keys.findLastIndex(isField);
    place(name, last < 0 ? keys.indexOf('title') + 1 : last + 1);
  }
  for (const key of BUILT_INS.filter((key) => !keys.includes(key))) {
    const before = (key === 'age' ? [] : key === 'who' ? ['age'] : ['who', 'age'])
      .map((next) => keys.indexOf(next))
      .find((index) => index >= 0);
    place(key, before ?? keys.length);
  }
  return keys.flatMap((key) => {
    const column = columnOf(collection, key);
    return column ? [column] : [];
  });
}

// The columns shown: those chosen, in their place, id and title always; the preset's without a
// choice.
export function chosenColumns(
  collection: CollectionView,
  chosen?: readonly string[],
): GridColumn[] {
  const keys = chosen ?? collection.view.columns;
  return availableColumns(collection).filter(
    ({ key }) => ALWAYS.includes(key) || keys.includes(key),
  );
}

// Filter works on a column with a fixed set of values or on free text; group on the same, given by
// sections.ts. Id, title, who and age only sort.
export function filterable(column: GridColumn): boolean {
  return column.values !== undefined || column.kind === 'text';
}

// ---- widths: the pane's width decides what shows, always in the same order ----

export type GridTier = 1 | 2 | 3 | 4 | 5;

// 1 everything; 2 the last field goes; 3 severity keeps only its bars; 4 the other fields go;
// 5 the table is no longer a table: the pane draws the list.
export const GRID_TIERS = { 1: 1000, 2: 880, 3: 760, 4: 640 } as const;

export function gridTier(width: number): GridTier {
  if (width >= GRID_TIERS[1]) return 1;
  if (width >= GRID_TIERS[2]) return 2;
  if (width >= GRID_TIERS[3]) return 3;
  if (width >= GRID_TIERS[4]) return 4;
  return 5;
}

// width: the column's content width (the title's is what is left: 0 here).
export type ShownColumn = { column: GridColumn; compact: boolean; width: number };

// Never dropped: id, title, severity, state, type, who and age. Severity, state and age are what
// triage decides on; the other fields leave, the last first.
const drops = (column: GridColumn) => column.kind === 'enum' || column.kind === 'text';

export function shownColumns(columns: readonly GridColumn[], tier: GridTier): ShownColumn[] {
  const droppable = columns.filter(drops);
  const last = droppable.at(-1);
  return columns
    .filter((column) => {
      if (!drops(column) || tier === 1) return true;
      return tier < 4 && column !== last;
    })
    .map((column) => {
      const compact = tier >= 3 && column.kind === 'severity';
      return { column, compact, width: columnWidth(column, compact) };
    });
}

// Mono at 12px is about 7px a character: a column takes its longest value or label and its
// padding, between 72 and 160px.
const widthFor = (texts: readonly string[], min: number) =>
  Math.min(160, Math.max(min, Math.max(...texts.map((text) => text.length)) * 7 + 40));

// A column's automatic width.
export function columnWidth(column: GridColumn, compact: boolean): number {
  switch (column.kind) {
    case 'id':
      // 72 holds BUGS-123; a longer prefix widens it (mono 12 is about 7.3px a character).
      return Math.max(72, Math.round((column.chars ?? 0) * 7.3 + 12));
    case 'title':
      return 0;
    case 'severity':
      return compact ? 52 : 112;
    case 'who':
      // The agent's mark or your chip, never the name.
      return 44;
    case 'age':
      return 56;
    case 'text':
      return 160;
    case 'state':
      return widthFor([column.label, ...(column.values ?? [])], 88);
    default:
      return widthFor([column.label, ...(column.values ?? [])], 72);
  }
}

// ---- the viewer's widths ----

// Id holds its ids, the title flexes, who a mark, age a short age: none of them resizes.
export function resizable(column: GridColumn): boolean {
  return !['id', 'title', 'who', 'age'].includes(column.kind);
}

// Severity under 112 shows its bars alone.
const SEVERITY_FULL = 112;
const MIN_WIDTH: Partial<Record<ColumnKind, number>> = {
  enum: 64,
  type: 64,
  state: 64,
  severity: 52,
  text: 80,
};
export const MAX_WIDTH = 480;

// The title never gives a resized column more than leaves it 240.
export const TITLE_MIN = 240;

const clampWidth = (column: GridColumn, width: number) =>
  Math.max(MIN_WIDTH[column.kind] ?? 0, Math.min(MAX_WIDTH, Math.round(width)));

// How far a column's edge goes: its minimum, and what leaves the title 240 (at most 480).
export function widthLimits(
  column: GridColumn,
  width: number,
  title: number,
): { min: number; max: number } {
  const min = MIN_WIDTH[column.kind] ?? width;
  return { min, max: Math.max(min, Math.min(MAX_WIDTH, width + Math.max(0, title - TITLE_MIN))) };
}

// A column's automatic width at this room (severity is bars alone from the third tier).
export const autoWidth = (column: GridColumn, room: number) =>
  columnWidth(column, gridTier(room) >= 3);

// A dragged edge within 6px of the column's automatic width takes it.
export const snapWidth = (width: number, auto: number) =>
  Math.abs(width - auto) <= 6 ? auto : width;

// The edge facing the title: a column after it is resized from its left edge (start), so the left
// arrow widens it; one before it from its right edge (end).
export type EdgeSide = 'start' | 'end';

// The separator's own keys, as the divider's: the arrows 16px (64 with Shift), Home and End.
export function edgeKeyWidth(
  key: string,
  shift: boolean,
  width: number,
  limits: { min: number; max: number },
  side: EdgeSide,
): number | undefined {
  const step = (shift ? 64 : 16) * (side === 'start' ? -1 : 1);
  const clamp = (next: number) => Math.max(limits.min, Math.min(limits.max, next));
  switch (key) {
    case 'ArrowLeft':
      return clamp(width - step);
    case 'ArrowRight':
      return clamp(width + step);
    case 'Home':
      return limits.min;
    case 'End':
      return limits.max;
    default:
      return undefined;
  }
}

// Only the resizable columns keep a width, clamped to their limits.
export function keptWidths(columns: readonly GridColumn[], widths: Widths): Record<string, number> {
  const kept: Record<string, number> = {};
  for (const column of columns.filter(resizable)) {
    const width = widths[column.key];
    if (typeof width === 'number' && Number.isFinite(width))
      kept[column.key] = clampWidth(column, width);
  }
  return kept;
}

// ---- fitting the room: what shows, and how wide ----

// 100 = the turn node 56 + the select box 28 + the row's 16 on the right.
const CHROME = 100;

const spare = (room: number, shown: readonly ShownColumn[]) =>
  room - CHROME - shown.reduce((sum, { width }) => sum + width, 0);

export type GridFit = { shown: ShownColumn[]; dropped: string[] };

// The tiers decide first; a column takes the width the viewer gave it. Before the title goes under
// 240 the widened columns give back towards automatic, in proportion (the widths kept are not
// rewritten: a wider room gets them back); then the fields leave in the tiers' order.
export function fitColumns(columns: readonly GridColumn[], room: number, widths: Widths): GridFit {
  const tier = gridTier(room);
  const own = keptWidths(columns, widths);
  const sized = (shown: ShownColumn): ShownColumn => {
    const width = own[shown.column.key] ?? shown.width;
    const compact = shown.column.kind === 'severity' && width < SEVERITY_FULL;
    return { ...shown, width, compact };
  };
  let shown = shownColumns(columns, tier === 5 ? 4 : tier).map(sized);
  const short = TITLE_MIN - spare(room, shown);
  if (short > 0) {
    const excess = (entry: ShownColumn) =>
      Math.max(0, entry.width - columnWidth(entry.column, tier >= 3));
    const total = shown.reduce((sum, entry) => sum + excess(entry), 0);
    const take = Math.min(total, short);
    if (take > 0) {
      shown = shown.map((entry) => {
        const width = Math.round(entry.width - (take * excess(entry)) / total);
        return {
          ...entry,
          width,
          compact: entry.column.kind === 'severity' && width < SEVERITY_FULL,
        };
      });
    }
  }
  while (spare(room, shown) < TITLE_MIN) {
    const victim = shown.findLast(({ column }) => drops(column));
    if (!victim) break;
    shown = shown.filter((entry) => entry !== victim);
  }
  return {
    shown,
    dropped: columns
      .filter((column) => !shown.some((entry) => entry.column === column))
      .map(({ key }) => key),
  };
}

// ---- the spare width: shared between the title and the air between the columns ----

// R is what the title would have alone. Up to 560 it takes all of it (no air); past that each
// further pixel goes a third to the title and two thirds to the air, one equal gap before every
// column after the title, at most 128. The title takes the rounding, so the table fills its room.
const MEASURE = 560;
const AIR_MAX = 128;

export type GridTemplate = { tracks: string; title: number; air: number };

// The table's tracks (--cols): the turn node and the select box, then each column, its width and,
// after the title, the air (padding-left: var(--air) inside its track). The title flexes in what
// is left, which is `title`. air: given while a column is dragged, so only the title moves.
export function gridTemplate(
  shown: readonly ShownColumn[],
  room: number,
  heldAir?: number,
): GridTemplate {
  const at = shown.findIndex(({ column }) => column.kind === 'title');
  const after = at < 0 ? 0 : shown.length - 1 - at;
  const rest = spare(room, shown);
  const air =
    heldAir ??
    (after > 0 && rest > MEASURE
      ? Math.min(AIR_MAX, Math.floor(((rest - MEASURE) * 2) / 3 / after))
      : 0);
  const tracks = shown.map(({ column, width }, index) =>
    column.kind === 'title' ? 'minmax(0, 1fr)' : `${width + (at >= 0 && index > at ? air : 0)}px`,
  );
  return { tracks: ['56px', '28px', ...tracks].join(' '), title: rest - after * air, air };
}

// ---- values ----

export function cellText(item: Item, column: GridColumn): string {
  switch (column.kind) {
    case 'id':
      return item.id;
    case 'title':
      return item.title;
    case 'state':
      return item.state;
    case 'type':
      return item.type;
    case 'who':
      return item.lease?.holder ?? '';
    case 'age':
      return item.updatedAt;
    default:
      return item.fields[column.key] ?? '';
  }
}

// Free text as the menus, the filters and the groups read it: trimmed, its inner spaces collapsed,
// in lowercase, so "Farm" and " farm " are one value. A cell keeps its own spelling.
export function normalText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

// A text field's values in these items, A to Z, the empty one last.
export function textValues(items: readonly Item[], key: string): string[] {
  const values = new Set(items.map((item) => normalText(item.fields[key] ?? '')));
  const named = [...values].filter((value) => value !== '').sort((a, b) => a.localeCompare(b));
  return values.has('') ? [...named, ''] : named;
}

// ---- sort: within each group, a header click goes first direction, the other, then the default ----

export function firstDirection(column: GridColumn): SortDirection {
  return column.kind === 'severity' ? 'desc' : 'asc';
}

export function nextSort(sort: Sort, column: GridColumn): Sort {
  const first = firstDirection(column);
  if (!sort || sort.key !== column.key) return { key: column.key, dir: first };
  if (sort.dir === first) return { key: column.key, dir: first === 'asc' ? 'desc' : 'asc' };
  return null;
}

const idNumber = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));

// A sort key: a number or a string, or undefined for an empty cell, which always sorts last.
function keyOf(item: Item, column: GridColumn): number | string | undefined {
  const text = cellText(item, column);
  switch (column.kind) {
    case 'id':
      return Number.isFinite(idNumber(text)) ? idNumber(text) : text;
    case 'age':
      return -Date.parse(text);
    case 'severity':
    case 'enum':
    case 'state':
    case 'type': {
      // Severity's values are listed worst first; ascending is least severe first.
      const values = column.values ?? [];
      const index = values.indexOf(text);
      if (index < 0) return text === '' ? undefined : values.length;
      return column.kind === 'severity' ? values.length - 1 - index : index;
    }
    case 'text':
      return normalText(text) || undefined;
    default:
      return text === '' ? undefined : text.toLocaleLowerCase();
  }
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function sortItems(items: readonly Item[], sort: Sort, columns: readonly GridColumn[]) {
  const column = sort ? columns.find(({ key }) => key === sort.key) : undefined;
  if (!sort || !column) return [...items];
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    const a = keyOf(left, column);
    const b = keyOf(right, column);
    if (a === undefined || b === undefined)
      return Number(a === undefined) - Number(b === undefined);
    return sign * compare(a, b);
  });
}

// ---- filters ----

// The value an item holds for a filter: a text field's normalized.
function heldValue(item: Item, key: string, text: ReadonlySet<string>): string {
  if (key === 'state') return item.state;
  if (key === 'type') return item.type;
  const value = item.fields[key] ?? '';
  return text.has(key) ? normalText(value) : value;
}

const textKeys = (columns: readonly GridColumn[]) =>
  new Set(columns.filter(({ kind }) => kind === 'text').map(({ key }) => key));

// skip: a column whose own filter is left out, to count what choosing its values would show.
function passes(item: Item, filters: Filters, text: ReadonlySet<string>, skip?: string): boolean {
  return Object.entries(filters).every(
    ([key, chosen]) =>
      key === skip || chosen.length === 0 || chosen.includes(heldValue(item, key, text)),
  );
}

// columns: every column the collection offers, to know which filters read free text.
export function filterItems(
  items: readonly Item[],
  filters: Filters,
  columns: readonly GridColumn[],
): Item[] {
  const text = textKeys(columns);
  return items.filter((item) => passes(item, filters, text));
}

export type FilterChoice = { value: string; label: string; count: number; on: boolean };

// How a filter value reads in a menu or a token: the empty one is "No <field>".
export const valueLabel = (column: GridColumn, value: string) =>
  value === '' ? `No ${column.label}` : value;

// A column's values (a text column's from the items) with how many items each would show beside
// the other filters; a value with nothing left to show drops out, unless it is chosen.
export function filterChoices(
  items: readonly Item[],
  column: GridColumn,
  filters: Filters,
  columns: readonly GridColumn[],
): FilterChoice[] {
  const text = textKeys(columns);
  const others = items.filter((item) => passes(item, filters, text, column.key));
  const chosen = filters[column.key] ?? [];
  const present = column.kind === 'text' ? textValues(items, column.key) : (column.values ?? []);
  // A chosen text value no item holds any more stays, to be unticked.
  const values = [...present, ...chosen.filter((value) => !present.includes(value))];
  return values
    .map((value) => ({
      value,
      label: valueLabel(column, value),
      count: others.filter((item) => heldValue(item, column.key, text) === value).length,
      on: chosen.includes(value),
    }))
    .filter(({ count, on }) => count > 0 || on);
}
