import {
  availableColumns,
  chosenColumns,
  type Filters,
  filterable,
  keptWidths,
  type Sort,
  type Widths,
} from './grid.ts';
import { groupings } from './sections.ts';
import type { CollectionView } from './types.ts';

// How this browser looks at a collection: list or grid, its grouping, its sort and its filters, and
// the grid's columns and the widths given to them. They belong to the collection, not to the view:
// switching keeps them, and the list honours the grouping, sort and filters too. Each is kept per
// collection in localStorage (`otea.view.<collection>`, `otea.group.…`, `otea.sort.…`,
// `otea.filters.…`, `otea.columns.…`, `otea.widths.…`); a browser that refuses storage follows
// the preset.
export type ViewMode = 'list' | 'grid';

// columns: the keys shown, in their place (grid.ts chosenColumns); widths: only the columns sized.
export type ViewPrefs = {
  mode: ViewMode;
  group: string;
  sort: Sort;
  filters: Filters;
  columns: readonly string[];
  widths: Widths;
};

export type PrefsStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const KEY = {
  mode: 'view',
  group: 'group',
  sort: 'sort',
  filters: 'filters',
  columns: 'columns',
  widths: 'widths',
} as const;

const keyOf = (part: keyof typeof KEY, collection: string) => `otea.${KEY[part]}.${collection}`;

function read(storage: PrefsStorage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function parse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function readViewPrefs(
  storage: PrefsStorage | undefined,
  collection: CollectionView,
): ViewPrefs {
  const name = collection.name;
  const available = availableColumns(collection);
  const offered = groupings(collection);
  const stored = {
    mode: read(storage, keyOf('mode', name)),
    group: read(storage, keyOf('group', name)),
    sort: parse(read(storage, keyOf('sort', name))),
    filters: parse(read(storage, keyOf('filters', name))),
    columns: parse(read(storage, keyOf('columns', name))),
    widths: parse(read(storage, keyOf('widths', name))),
  };
  // Unknown keys go, id and title come back, the order is the preset's.
  const columns = chosenColumns(
    collection,
    Array.isArray(stored.columns)
      ? stored.columns.filter((key): key is string => typeof key === 'string')
      : undefined,
  );
  const mode: ViewMode =
    stored.mode === 'list' || stored.mode === 'grid'
      ? stored.mode
      : collection.view.kind === 'grid'
        ? 'grid'
        : 'list';
  const preset = offered.includes(collection.view.groupBy) ? collection.view.groupBy : 'turn';
  const group = stored.group !== null && offered.includes(stored.group) ? stored.group : preset;
  const sorted = stored.sort;
  const sort: Sort =
    isRecord(sorted) &&
    columns.some(({ key }) => key === sorted.key) &&
    (sorted.dir === 'asc' || sorted.dir === 'desc')
      ? { key: String(sorted.key), dir: sorted.dir }
      : null;
  // A filter stays on a hidden column (its token says so); a text field keeps any string.
  const filters: Record<string, string[]> = {};
  if (isRecord(stored.filters)) {
    for (const column of available.filter(filterable)) {
      const chosen = stored.filters[column.key];
      if (!Array.isArray(chosen)) continue;
      const values = chosen.filter((value): value is string => typeof value === 'string');
      if (values.length > 0) filters[column.key] = values;
    }
  }
  const widths = isRecord(stored.widths)
    ? keptWidths(available, stored.widths as Record<string, number>)
    : {};
  return { mode, group, sort, filters, columns: columns.map(({ key }) => key), widths };
}

// Writes only the choices given; a failure leaves them applied in this tab, just not remembered.
export function writeViewPrefs(
  storage: PrefsStorage | undefined,
  collection: string,
  prefs: Partial<ViewPrefs>,
): void {
  const entries: [keyof typeof KEY, string][] = [];
  if (prefs.mode !== undefined) entries.push(['mode', prefs.mode]);
  if (prefs.group !== undefined) entries.push(['group', prefs.group]);
  if (prefs.sort !== undefined) entries.push(['sort', JSON.stringify(prefs.sort)]);
  if (prefs.filters !== undefined) entries.push(['filters', JSON.stringify(prefs.filters)]);
  if (prefs.columns !== undefined) entries.push(['columns', JSON.stringify(prefs.columns)]);
  if (prefs.widths !== undefined) entries.push(['widths', JSON.stringify(prefs.widths)]);
  for (const [part, value] of entries) {
    try {
      storage?.setItem(keyOf(part, collection), value);
    } catch {
      // Applied in this tab; just not remembered.
    }
  }
}
