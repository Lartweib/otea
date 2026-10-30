import type { Section } from './sections.ts';
import type { Item } from './types.ts';

// How a row sits in the list: how deep under its parents, and for a parent with children in its
// section, how many and whether the viewer folded them.
export type RowNesting = { depth: number; nested?: number; collapsed?: boolean };

// total: every item of the section, shown or folded under a collapsed parent.
export type NestedSection = Section & { total: number };

export type Nesting = { sections: NestedSection[]; rows: ReadonlyMap<string, RowNesting> };

export function parentOf(item: Item): string | undefined {
  return item.relations?.find(({ kind }) => kind === 'parent')?.id;
}

// Children follow their parent when both sit in the same section, which keeps every row on its own
// lane: a section holds one turn. A child elsewhere (waiting for you while its parent is with
// agents, or closed) stays where its turn puts it, so nothing yours ever folds out of sight.
function nest(section: Section, collapsed: ReadonlySet<string>, rows: Map<string, RowNesting>) {
  const here = new Set(section.items.map(({ id }) => id));
  const under = new Map<string, Item[]>();
  for (const item of section.items) {
    const parent = parentOf(item);
    if (parent !== undefined && here.has(parent)) {
      under.set(parent, [...(under.get(parent) ?? []), item]);
    }
  }
  const shown: Item[] = [];
  const placed = new Set<string>();
  const place = (item: Item, depth: number, hidden: boolean) => {
    if (placed.has(item.id)) return;
    placed.add(item.id);
    const children = under.get(item.id) ?? [];
    const folded = collapsed.has(item.id);
    if (!hidden) {
      shown.push(item);
      rows.set(
        item.id,
        children.length > 0 ? { depth, nested: children.length, collapsed: folded } : { depth },
      );
    }
    for (const child of children) place(child, depth + 1, hidden || folded);
  };
  for (const item of section.items) {
    const parent = parentOf(item);
    if (parent === undefined || !here.has(parent)) place(item, 0, false);
  }
  // A loop of parents in stale data has no root: its items still show, flat.
  for (const item of section.items) place(item, 0, false);
  return { ...section, items: shown, total: section.items.length };
}

export function nestSections(
  sections: readonly Section[],
  collapsed: ReadonlySet<string>,
): Nesting {
  const rows = new Map<string, RowNesting>();
  return { sections: sections.map((section) => nest(section, collapsed, rows)), rows };
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

// Which parents this viewer folded, remembered in their browser only. Storage can be missing or
// throw (private windows, blocked site data): nothing is folded then.
export function readCollapsed(storage: CollapseStorage | undefined): Set<string> {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(COLLAPSED_KEY) ?? '[]');
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function writeCollapsed(
  storage: CollapseStorage | undefined,
  collapsed: ReadonlySet<string>,
): void {
  try {
    storage?.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // The fold still applies in this tab; it just will not be remembered.
  }
}
