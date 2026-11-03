import type { Folds, NestedSection, Nesting, RowNesting, WorkVia } from './nesting.ts';
import { parentOf } from './nesting.ts';
import { groupByTurn } from './sections.ts';
import type { Item } from './types.ts';

// How a node of All work hangs from the one above it: a child of the same collection, something
// that blocks it, or something that implements it.
export type WorkLink = 'child' | WorkVia;

// key: the row's own key, the item's id the first time it shows. alsoUnder: on a repeated row, the
// item it first sits under. nodes: what sits under it, empty on a repeated row.
export type WorkNode = {
  key: string;
  item: Item;
  via?: WorkLink;
  alsoUnder?: string;
  nodes: WorkNode[];
};

const LINK_ORDER: readonly WorkLink[] = ['child', 'blocked_by', 'implemented_by'];

// What an item hangs from, and how: its parent when that parent is listed in the same collection,
// and every listed item it blocks or implements, whatever their collection.
function hostsOf(item: Item, listed: ReadonlyMap<string, Item>): { id: string; via: WorkLink }[] {
  const hosts: { id: string; via: WorkLink }[] = [];
  const parent = parentOf(item);
  if (parent !== undefined && listed.get(parent)?.collection === item.collection) {
    hosts.push({ id: parent, via: 'child' });
  }
  for (const { kind, id } of item.relations ?? []) {
    if (!listed.has(id)) continue;
    if (kind === 'blocks') hosts.push({ id, via: 'blocked_by' });
    if (kind === 'implements') hosts.push({ id, via: 'implemented_by' });
  }
  return hosts;
}

// The tree All work lists, across collections. The rule for a root: an item is a root when it hangs
// from nothing listed, that is, it has no parent in its own collection and blocks or implements
// nothing listed. Everything else sits under what it hangs from: children (same collection), then
// what blocks it, then what implements it, each in list order. `relates` builds no level. An item
// that hangs from two places shows under both: the first time whole, after that as a leaf that says
// where it first sits, so nothing expands twice and a loop ends. Items no root reaches (a loop of
// links in stale data) become roots themselves, in list order, so every item shows.
export function workTree(items: readonly Item[]): WorkNode[] {
  const listed = new Map(items.map((item) => [item.id, item]));
  const under = new Map<string, { item: Item; via: WorkLink }[]>();
  const roots: Item[] = [];
  for (const item of items) {
    const hosts = hostsOf(item, listed);
    if (hosts.length === 0) roots.push(item);
    for (const { id, via } of hosts) under.set(id, [...(under.get(id) ?? []), { item, via }]);
  }
  for (const [id, hung] of under) {
    under.set(
      id,
      hung.toSorted((a, b) => LINK_ORDER.indexOf(a.via) - LINK_ORDER.indexOf(b.via)),
    );
  }
  // Where each item first showed: the item it sits under (none for a root).
  const firstUnder = new Map<string, string | undefined>();
  const grow = (
    item: Item,
    key: string,
    path: ReadonlySet<string>,
    host?: string,
    via?: WorkLink,
  ): WorkNode => {
    if (firstUnder.has(item.id)) {
      const first = firstUnder.get(item.id);
      return {
        key,
        item,
        ...(via ? { via } : {}),
        ...(first ? { alsoUnder: first } : {}),
        nodes: [],
      };
    }
    firstUnder.set(item.id, host);
    const node: WorkNode = { key, item, ...(via ? { via } : {}), nodes: [] };
    const along = new Set(path).add(item.id);
    // A row never repeats the rows it hangs from: a loop of links ends where it started.
    for (const hung of under.get(item.id) ?? []) {
      if (along.has(hung.item.id)) continue;
      const seen = firstUnder.has(hung.item.id);
      const childKey = seen ? `${key}>${hung.via}:${hung.item.id}` : hung.item.id;
      node.nodes.push(grow(hung.item, childKey, along, item.id, hung.via));
    }
    return node;
  };
  const tree = roots.map((item) => grow(item, item.id, new Set()));
  for (const item of items) if (!firstUnder.has(item.id)) tree.push(grow(item, item.id, new Set()));
  return tree;
}

const relatesOf = (item: Item) =>
  (item.relations ?? []).filter(({ kind }) => kind === 'relates').length;

// The rows a node and what it holds put in a section, and how each sits; folded nodes keep their
// rows out of sight but still count the ones waiting for you.
function flatten(
  node: WorkNode,
  depth: number,
  hidden: boolean,
  folds: Folds,
  out: { rows: Item[]; keys: string[]; nesting: Map<string, RowNesting>; yours: number },
  titleOf: (id: string) => string | undefined,
) {
  const settled = node.nodes.length > 0 && node.nodes.every(({ item }) => item.turn === 'none');
  const folded = settled ? !folds.expanded.has(node.key) : folds.collapsed.has(node.key);
  if (depth > 0 && node.item.turn === 'human') out.yours += 1;
  if (!hidden) {
    out.rows.push(node.item);
    out.keys.push(node.key);
    const row: RowNesting = { depth };
    if (node.nodes.length > 0) {
      row.nested = node.nodes.length;
      row.collapsed = folded;
      if (settled) row.settled = true;
    }
    const parent = parentOf(node.item);
    if (depth === 0 && parent !== undefined) {
      const title = titleOf(parent);
      row.parent = title === undefined ? { id: parent } : { id: parent, title };
    }
    if (node.via && node.via !== 'child') row.via = node.via;
    if (node.alsoUnder !== undefined) row.alsoUnder = node.alsoUnder;
    const relates = relatesOf(node.item);
    if (relates > 0) row.relates = relates;
    out.nesting.set(node.key, row);
  }
  for (const each of node.nodes) flatten(each, depth + 1, hidden || folded, folds, out, titleOf);
}

// All work as the list draws it: the roots grouped by turn like any list, each with the rows that
// hang from it right under it whatever their turn (each on its own lane), so a section counts its
// roots and says how many rows of yours sit inside.
export function allWork(items: readonly Item[], folds: Folds): Nesting {
  const tree = workTree(items);
  const nodeOf = new Map(tree.map((node) => [node.item.id, node]));
  const titles = new Map(items.map((item) => [item.id, item.title]));
  const nesting = new Map<string, RowNesting>();
  const sections: NestedSection[] = groupByTurn(tree.map(({ item }) => item)).map((section) => {
    const out = { rows: [] as Item[], keys: [] as string[], nesting, yours: 0 };
    for (const root of section.items) {
      const node = nodeOf.get(root.id);
      if (node) flatten(node, 0, false, folds, out, (id) => titles.get(id));
    }
    const total = section.items.length;
    const base = { ...section, items: out.rows, keys: out.keys, total };
    return section.turn !== 'human' && out.yours > 0 ? { ...base, yoursInside: out.yours } : base;
  });
  return { sections, rows: nesting };
}
