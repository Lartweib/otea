import type { NodeKind } from './node-kind.ts';
import type { ChildrenSummary, Item, RelatedItem, RelationKind, RelationView } from './types.ts';

// How a relation reads from the item that shows it, in the order the detail lists them.
const LABELS: Readonly<Record<RelationView, string>> = {
  parent: 'parent',
  child: 'children',
  blocks: 'blocks',
  blocked_by: 'blocked by',
  duplicates: 'duplicates',
  duplicated_by: 'duplicated by',
  implements: 'implements',
  implemented_by: 'implemented by',
  relates: 'related',
};

// What each kind, read from this item, is stored as: the stored kind, and whether this item is its
// `to` side (an inverse kind is stored from the other item).
const STORED: Readonly<Record<RelationView, { kind: RelationKind; inverse: boolean }>> = {
  parent: { kind: 'parent', inverse: false },
  child: { kind: 'parent', inverse: true },
  blocks: { kind: 'blocks', inverse: false },
  blocked_by: { kind: 'blocks', inverse: true },
  duplicates: { kind: 'duplicates', inverse: false },
  duplicated_by: { kind: 'duplicates', inverse: true },
  implements: { kind: 'implements', inverse: false },
  implemented_by: { kind: 'implements', inverse: true },
  relates: { kind: 'relates', inverse: false },
};

const ORDER = Object.keys(LABELS) as RelationView[];

// The kinds a person may pick when linking, phrased from the item they are on.
export const LINK_CHOICES: ReadonlyArray<{ kind: RelationView; label: string }> = [
  { kind: 'parent', label: 'is a child of' },
  { kind: 'child', label: 'is the parent of' },
  { kind: 'blocks', label: 'blocks' },
  { kind: 'blocked_by', label: 'is blocked by' },
  { kind: 'duplicates', label: 'duplicates' },
  { kind: 'duplicated_by', label: 'is duplicated by' },
  { kind: 'implements', label: 'implements' },
  { kind: 'implemented_by', label: 'is implemented by' },
  { kind: 'relates', label: 'relates to' },
];

export type RelationGroup = { kind: RelationView; label: string; items: RelatedItem[] };

// withChildren: false when the layout also places a children module, which draws them.
export function groupRelations(
  relations: readonly RelatedItem[],
  { withChildren = true }: { withChildren?: boolean } = {},
): RelationGroup[] {
  return ORDER.filter((kind) => withChildren || kind !== 'child').flatMap((kind) => {
    const items = relations.filter((relation) => relation.kind === kind);
    return items.length > 0 ? [{ kind, label: LABELS[kind], items }] : [];
  });
}

// The body of a link or unlink: the stored kind, from the item it is stored from.
export type LinkRequest = { id: string; kind: RelationKind; other: string };

export function linkRequestOf(id: string, kind: RelationView, other: string): LinkRequest {
  const stored = STORED[kind];
  return stored.inverse
    ? { id: other, kind: stored.kind, other: id }
    : { id, kind: stored.kind, other };
}

export function unlinkRequestOf(id: string, relation: RelatedItem): LinkRequest {
  return linkRequestOf(id, relation.kind, relation.id);
}

// Items to link to, by id or title: an exact id first, then in list order.
export function matchItems(
  items: readonly Item[],
  query: string,
  exclude: readonly string[],
  limit = 6,
): Item[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const skip = new Set(exclude);
  const found = items.filter(
    ({ id, title }) =>
      !skip.has(id) && (id.toLowerCase().includes(needle) || title.toLowerCase().includes(needle)),
  );
  const exact = found.filter(({ id }) => id.toLowerCase() === needle);
  return [...exact, ...found.filter((item) => !exact.includes(item))].slice(0, limit);
}

// A parent's open children, as its row says it.
export function openLabel({ total, open }: ChildrenSummary): string {
  return `${open} of ${total} open`;
}

const SEGMENT_ORDER: Readonly<Record<NodeKind, number>> = {
  done: 0,
  discarded: 1,
  you: 2,
  working: 3,
  queued: 4,
  incomplete: 4,
};

// A parent's progress bar, one segment per child: closed first, then yours, then the agents', so the
// bar fills from the left as children close.
export function childSegments(kinds: readonly NodeKind[]): NodeKind[] {
  return [...kinds].sort((a, b) => SEGMENT_ORDER[a] - SEGMENT_ORDER[b]);
}

export type ChildTally = { yours: number; agents: number; closed: number };

// The bar's legend: children on your turn, with agents, and closed.
export function childTally(kinds: readonly NodeKind[]): ChildTally {
  const tally: ChildTally = { yours: 0, agents: 0, closed: 0 };
  for (const kind of kinds) {
    if (kind === 'you') tally.yours += 1;
    else if (kind === 'done' || kind === 'discarded') tally.closed += 1;
    else tally.agents += 1;
  }
  return tally;
}
