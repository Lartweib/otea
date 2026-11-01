import { type Filters, gridColumns, hasValues, type Sort } from './grid.ts';
import { groupings } from './sections.ts';
import type { CollectionView } from './types.ts';

// How this browser looks at a collection: list or grid, its grouping, its sort and its filters.
// They belong to the collection, not to the view: switching keeps them, and the list honours them
// too. Each is kept per collection in localStorage (`otea.view.<collection>`, `otea.group.…`,
// `otea.sort.…`, `otea.filters.…`); a browser that refuses storage follows the preset.
export type ViewMode = 'list' | 'grid';

export type ViewPrefs = { mode: ViewMode; group: string; sort: Sort; filters: Filters };

export type PrefsStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const KEY = { mode: 'view', group: 'group', sort: 'sort', filters: 'filters' } as const;

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
  const columns = gridColumns(collection);
  const offered = groupings(collection);
  const stored = {
    mode: read(storage, keyOf('mode', name)),
    group: read(storage, keyOf('group', name)),
    sort: parse(read(storage, keyOf('sort', name))),
    filters: parse(read(storage, keyOf('filters', name))),
  };
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
  const filters: Record<string, string[]> = {};
  if (isRecord(stored.filters)) {
    for (const column of columns.filter(hasValues)) {
      const chosen = stored.filters[column.key];
      if (!Array.isArray(chosen)) continue;
      const values = chosen.filter((value): value is string => typeof value === 'string');
      if (values.length > 0) filters[column.key] = values;
    }
  }
  return { mode, group, sort, filters };
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
  for (const [part, value] of entries) {
    try {
      storage?.setItem(keyOf(part, collection), value);
    } catch {
      // Applied in this tab; just not remembered.
    }
  }
}
