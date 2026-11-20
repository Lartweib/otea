import type { Item } from './types.ts';

// What the viewer folded: parents with open children they collapsed, and parents whose children are
// all closed (folded by default) they expanded.
export type Folds = { collapsed: ReadonlySet<string>; expanded: ReadonlySet<string> };

export function parentOf(item: Item): string | undefined {
  return item.relations?.find(({ kind }) => kind === 'parent')?.id;
}

// Folds or unfolds a parent: settled parents are remembered when unfolded, the others when folded.
export function toggleFold(folds: Folds, id: string, settled: boolean): Folds {
  return settled
    ? { ...folds, expanded: toggleCollapsed(folds.expanded, id) }
    : { ...folds, collapsed: toggleCollapsed(folds.collapsed, id) };
}

export function toggleCollapsed(collapsed: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export type CollapseStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const COLLAPSED_KEY = 'otea.collapsed';
export const EXPANDED_KEY = 'otea.expanded';

// Which parents this viewer folded (or, under EXPANDED_KEY, unfolded), remembered in their browser only. Storage can be missing or
// throw (private windows, blocked site data): nothing is folded then.
export function readCollapsed(
  storage: CollapseStorage | undefined,
  key = COLLAPSED_KEY,
): Set<string> {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function writeCollapsed(
  storage: CollapseStorage | undefined,
  collapsed: ReadonlySet<string>,
  key = COLLAPSED_KEY,
): void {
  try {
    storage?.setItem(key, JSON.stringify([...collapsed]));
  } catch {
    // The fold still applies in this tab; it just will not be remembered.
  }
}
