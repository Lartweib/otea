import type { CollectionView, FieldView, Item } from './types.ts';

// The grid: a collection's items as a table, one row each, its columns from the preset
// (`view.columns`). Every row starts with the turn node on its lanes and a select box, which are not
// columns. Only the title flexes; the other columns have a width of their own.

export type ColumnKind = 'id' | 'title' | 'state' | 'type' | 'who' | 'age' | FieldKind;

type FieldKind = 'enum' | 'severity' | 'text';

// values: what an enum, severity, state or type column can hold, in the order the menus list them
// (severity from the worst down).
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

// The chosen values of each filtered column: an item passes when it holds one of them.
export type Filters = Readonly<Record<string, readonly string[]>>;

const BUILT_IN: Record<string, ColumnKind> = {
  id: 'id',
  title: 'title',
  state: 'state',
  type: 'type',
  who: 'who',
  age: 'age',
};

const fieldKind = (module: string): FieldKind =>
  module === 'enum' || module === 'severity' ? module : 'text';

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
  if (!field) return undefined;
  const kind = fieldKind(field.module);
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

// Filter and group work on columns with a fixed set of values; the rest only sort.
export function hasValues(column: GridColumn): boolean {
  return column.values !== undefined;
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

export type ShownColumn = { column: GridColumn; compact: boolean };

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
    .map((column) => ({
      column,
      compact: tier >= 3 && column.kind === 'severity',
    }));
}

// Mono at 12px is about 7px a character: a column takes its longest value or label and its
// padding, between 72 and 160px.
const widthFor = (texts: readonly string[], min: number) =>
  Math.min(160, Math.max(min, Math.max(...texts.map((text) => text.length)) * 7 + 40));

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

// The turn node (56) and the select box (28) come first; the title is the one column that flexes.
export function gridTemplate(shown: readonly ShownColumn[]): string {
  const tracks = shown.map(({ column, compact }) =>
    column.kind === 'title' ? 'minmax(0, 1fr)' : `${columnWidth(column, compact)}px`,
  );
  return ['56px', '28px', ...tracks].join(' ');
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

const groupValue = (item: Item, key: string) =>
  key === 'state' ? item.state : key === 'type' ? item.type : (item.fields[key] ?? '');

// skip: a column whose own filter is left out, to count what choosing its values would show.
function passes(item: Item, filters: Filters, skip?: string): boolean {
  return Object.entries(filters).every(
    ([key, chosen]) =>
      key === skip || chosen.length === 0 || chosen.includes(groupValue(item, key)),
  );
}

export function filterItems(items: readonly Item[], filters: Filters): Item[] {
  return items.filter((item) => passes(item, filters));
}

export type FilterChoice = { value: string; count: number; on: boolean };

// A column's values with how many items each would show beside the other filters; a value with
// nothing left to show drops out, unless it is chosen.
export function filterChoices(
  items: readonly Item[],
  column: GridColumn,
  filters: Filters,
): FilterChoice[] {
  const others = items.filter((item) => passes(item, filters, column.key));
  const chosen = filters[column.key] ?? [];
  return (column.values ?? [])
    .map((value) => ({
      value,
      count: others.filter((item) => groupValue(item, column.key) === value).length,
      on: chosen.includes(value),
    }))
    .filter(({ count, on }) => count > 0 || on);
}
