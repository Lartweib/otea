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

export function progressLabel({ total, open, done, discarded }: ChildrenSummary): string {
  const closed = total - open;
  const how = [
    ...(done > 0 ? [`${done} done`] : []),
    ...(discarded > 0 ? [`${discarded} discarded`] : []),
  ];
  return [`${closed} of ${total} closed`, ...how].join(' · ');
}

const round = (value: number) => Math.round(value * 100) / 100;

const PAD = 10;
const R = 5.5;

// A parent's children as nodes on one track, the way closed items fuse into the trunk of a list:
// closed ones first, the trunk drawn through them up to `closedUntil`, then the open ones on the
// lane. Nodes shrink to keep apart when there are many.
export type ChildTrack = {
  r: number;
  nodes: Array<{ id: string; x: number; child: RelatedItem }>;
  closedUntil?: number;
};

export function childTrack(children: readonly RelatedItem[], width: number): ChildTrack {
  const closed = children.filter(({ closes }) => closes !== undefined);
  const open = children.filter(({ closes }) => closes === undefined);
  const ordered = [...closed, ...open];
  const step = ordered.length > 1 ? (width - 2 * PAD) / (ordered.length - 1) : 0;
  const r = step === 0 ? R : Math.min(R, Math.max(2.5, step * 0.38));
  const nodes = ordered.map((child, index) => ({
    id: child.id,
    x: round(PAD + index * step),
    child,
  }));
  const last = nodes[closed.length - 1];
  return last === undefined ? { r, nodes } : { r, nodes, closedUntil: last.x };
}
