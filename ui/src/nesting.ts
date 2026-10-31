import type { Section } from './sections.ts';
import type { Item } from './types.ts';

// The parent a row points to when it is not nested under it (they sit in different groups).
export type ParentRef = { id: string; title?: string };

// How a row sits in the list: how deep under its parents; for a parent with children nested under
// it, how many, whether they are folded, and whether every child is closed (settled), which folds
// them unless the viewer unfolds them; for a row whose parent sits elsewhere, a reference to it.
export type RowNesting = {
  depth: number;
  nested?: number;
  collapsed?: boolean;
  settled?: boolean;
  parent?: ParentRef;
};

// total: the items of the section's own turn, shown or folded under a collapsed parent.
export type NestedSection = Section & { total: number };

export type Nesting = { sections: NestedSection[]; rows: ReadonlyMap<string, RowNesting> };

// What the viewer folded: parents with open children they collapsed, and parents whose children are
// all closed (folded by default) they expanded.
export type Folds = { collapsed: ReadonlySet<string>; expanded: ReadonlySet<string> };

export function parentOf(item: Item): string | undefined {
  return item.relations?.find(({ kind }) => kind === 'parent')?.id;
}

// Every child of the item is closed.
function isSettled(item: Item): boolean {
  const summary = item.children;
  return summary !== undefined && summary.total > 0 && summary.open === 0;
}

// Children follow their parent when both sit in the same section, which keeps every row on its own
// lane: a section holds one turn. A child elsewhere (waiting for you while its parent is with
// agents, or closed while its siblings are open) stays where its turn puts it, with a reference to
// its parent, so nothing yours ever folds out of sight. The closed children of an open parent whose
// children are all closed come along under it, folded unless the viewer unfolds them.
function nest(
  section: Section,
  extra: readonly Item[],
  folds: Folds,
  rows: Map<string, RowNesting>,
  titleOf: (id: string) => string | undefined,
) {
  const items = [...section.items, ...extra];
  const here = new Set(items.map(({ id }) => id));
  const byId = new Map(items.map((item) => [item.id, item]));
  const under = new Map<string, Item[]>();
  for (const item of items) {
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
    const settled = isSettled(item);
    const folded = settled ? !folds.expanded.has(item.id) : folds.collapsed.has(item.id);
    if (!hidden) {
      shown.push(item);
      const row: RowNesting = { depth };
      if (children.length > 0) {
        row.nested = children.length;
        row.collapsed = folded;
        if (settled) row.settled = true;
      }
      const parent = parentOf(item);
      if (depth === 0 && parent !== undefined && !byId.has(parent)) {
        const title = titleOf(parent);
        row.parent = title === undefined ? { id: parent } : { id: parent, title };
      }
      rows.set(item.id, row);
    }
    for (const child of children) place(child, depth + 1, hidden || folded);
  };
  for (const item of items) {
    const parent = parentOf(item);
    if (parent === undefined || !here.has(parent)) place(item, 0, false);
  }
  // A loop of parents in stale data has no root: its items still show, flat.
  for (const item of items) place(item, 0, false);
  return { ...section, items: shown, total: section.items.length };
}

// itemOf finds any item, also one outside the sections (another collection), to name a parent.
export function nestSections(
  sections: readonly Section[],
  folds: Folds,
  itemOf: (id: string) => Item | undefined = () => undefined,
): Nesting {
  const rows = new Map<string, RowNesting>();
  const sectionOf = new Map<string, number>();
  sections.forEach((section, index) => {
    for (const item of section.items) sectionOf.set(item.id, index);
  });
  const find = (id: string) =>
    itemOf(id) ?? sections.flatMap((section) => section.items).find((item) => item.id === id);
  // The closed children that join an open parent whose children are all closed.
  const joining = new Map<number, Item[]>();
  const left = new Set<string>();
  for (const section of sections) {
    if (section.turn !== 'none') continue;
    for (const item of section.items) {
      const parent = parentOf(item);
      const at = parent === undefined ? undefined : sectionOf.get(parent);
      const host = parent === undefined ? undefined : find(parent);
      if (at === undefined || !host || host.turn === 'none' || !isSettled(host)) continue;
      joining.set(at, [...(joining.get(at) ?? []), item]);
      left.add(item.id);
    }
  }
  const titleOf = (id: string) => find(id)?.title;
  return {
    sections: sections.map((section, index) => {
      const own = { ...section, items: section.items.filter(({ id }) => !left.has(id)) };
      return nest(own, joining.get(index) ?? [], folds, rows, titleOf);
    }),
    rows,
  };
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
