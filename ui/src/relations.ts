import { type PlainKey, t } from './i18n/i18n.ts';
import type { ChildrenSummary, RelatedItem, RelationKind, RelationView } from './types.ts';

// How a relation reads from the item that shows it, in the order the detail lists them.
const LABELS: Readonly<Record<RelationView, PlainKey>> = {
  parent: 'relation.parent',
  child: 'relation.child',
  blocks: 'relation.blocks',
  blocked_by: 'relation.blocked_by',
  duplicates: 'relation.duplicates',
  duplicated_by: 'relation.duplicated_by',
  implements: 'relation.implements',
  implemented_by: 'relation.implemented_by',
  relates: 'relation.relates',
};

export function relationLabel(kind: RelationView): string {
  return t(LABELS[kind]);
}

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

export type RelationGroup = { kind: RelationView; label: string; items: RelatedItem[] };

// withChildren: false when the layout also places a children module, which draws them.
export function groupRelations(
  relations: readonly RelatedItem[],
  { withChildren = true }: { withChildren?: boolean } = {},
): RelationGroup[] {
  return ORDER.filter((kind) => withChildren || kind !== 'child').flatMap((kind) => {
    const items = relations.filter((relation) => relation.kind === kind);
    return items.length > 0 ? [{ kind, label: relationLabel(kind), items }] : [];
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

// A parent's open children, as its row says it.
export function openLabel({ total, open }: ChildrenSummary): string {
  return t('children.open', { open, count: total });
}
