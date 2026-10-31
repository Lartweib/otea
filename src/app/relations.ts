import type { DatabaseSync } from 'node:sqlite';
import type { Channel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import type { Lease } from '../core/lease.ts';
import {
  assertCanRelate,
  assertChildrenClosed,
  childrenSummary,
  matchesRelation,
  normalizeRelation,
  parseRelationKind,
  RELATION_VIEWS,
  type Relation,
  type RelationRef,
  viewOf,
} from '../core/relations.ts';
import { type Closing, requirementOf, type Turn, type Workflow } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  deleteRelation,
  type ItemRecord,
  insertRelation,
  type RelationRecord,
  selectRelations,
  selectRelationsOf,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Item, present, requireItem, systemClock, workflowOf } from './items.ts';

// `kind` is one of the stored kinds; `other` is the item the relation points to: `otea link A blocks
// B` reads A blocks B, and `otea link A parent B` makes B the parent of A.
export type LinkInput = {
  id: string;
  kind: string;
  other: string;
  actor: Actor;
  channel: Channel;
};

type Who = { actor: Actor; channel: Channel };

// A relation with where the other item stands, as `otea show` lists it.
export type RelatedItem = RelationRef & {
  collection: string;
  type: string;
  title: string;
  state: string;
  turn: Turn;
  closes?: Closing;
  lease: Lease | null;
};

function presented(ctx: Context, record: ItemRecord, at: string): Item {
  return present(record, workflowOf(ctx, record), at);
}

function recordRelation(db: DatabaseSync, type: string, relation: Relation, who: Who, at: string) {
  const data = { kind: relation.kind, from: relation.from, to: relation.to, channel: who.channel };
  for (const itemId of new Set([relation.from, relation.to])) {
    appendEvent(db, { itemId, type, actor: who.actor, at, data });
  }
}

// Stores a relation inside an open transaction, once both items exist and the core rules hold. An
// open item cannot get a closed parent: a closed parent stays with every child it closed with.
export function addRelation(ctx: Context, given: Relation, who: Who, at: string): RelationRecord {
  const { db } = ctx;
  const relation = normalizeRelation(given);
  const from = requireItem(db, relation.from);
  const to = requireItem(db, relation.to);
  assertCanRelate(selectRelations(db), relation);
  if (relation.kind === 'parent') {
    const parent = presented(ctx, to, at);
    if (parent.closes !== undefined && presented(ctx, from, at).closes === undefined) {
      throw new OteaError(
        'item_closed',
        `${to.id} is ${to.state} (closed) and takes no open child; reopen it or link with relates`,
      );
    }
  }
  const record = { ...relation, createdAt: at, actor: who.actor, channel: who.channel };
  insertRelation(db, record);
  recordRelation(db, 'relation_added', relation, who, at);
  return record;
}

function relationOf(input: LinkInput): Relation {
  return { kind: parseRelationKind(input.kind), from: input.id, to: input.other };
}

// Agents and humans link alike. A relation changes neither item's fields nor state, so it is not
// bound by leases and links closed items too.
export function linkItems(ctx: Context, input: LinkInput, now = systemClock): RelationRecord {
  const relation = relationOf(input);
  const { actor, channel } = input;
  return transaction(ctx.db, () => addRelation(ctx, relation, { actor, channel }, now()));
}

export function unlinkItems(ctx: Context, input: LinkInput, now = systemClock): Relation {
  const given = relationOf(input);
  const { db } = ctx;
  return transaction(db, () => {
    requireItem(db, given.from);
    requireItem(db, given.to);
    const stored = selectRelations(db, given.kind).find((relation) =>
      matchesRelation(relation, given),
    );
    if (!stored) {
      const text = `${given.from} ${given.kind} ${given.to}`;
      throw new OteaError('not_found', `No relation "${text}" to remove`);
    }
    const relation: Relation = { kind: stored.kind, from: stored.from, to: stored.to };
    deleteRelation(db, relation);
    recordRelation(db, 'relation_removed', relation, input, now());
    return relation;
  });
}

export function listRelations(ctx: Context): RelationRecord[] {
  return selectRelations(ctx.db);
}

const VIEW_ORDER = new Map(RELATION_VIEWS.map((kind, index) => [kind, index]));

// An item's relations as it reads them, grouped by kind in a fixed order, oldest first within each.
export function refsOf(relations: readonly Relation[], id: string): RelationRef[] {
  return relations
    .filter(({ from, to }) => from === id || to === id)
    .map((relation) => viewOf(relation, id))
    .sort((a, b) => (VIEW_ORDER.get(a.kind) ?? 0) - (VIEW_ORDER.get(b.kind) ?? 0));
}

export function relatedItems(ctx: Context, id: string, at: string): RelatedItem[] {
  return refsOf(selectRelationsOf(ctx.db, id), id).map((ref) => {
    const other = presented(ctx, requireItem(ctx.db, ref.id), at);
    const related: RelatedItem = {
      ...ref,
      collection: other.collection,
      type: other.type,
      title: other.title,
      state: other.state,
      turn: other.turn,
      lease: other.lease,
    };
    if (other.closes !== undefined) related.closes = other.closes;
    return related;
  });
}

export function childIds(relations: readonly Relation[], id: string): string[] {
  return relations.filter(({ kind, to }) => kind === 'parent' && to === id).map(({ from }) => from);
}

export function childrenOf(ctx: Context, id: string, at: string): Item[] {
  return childIds(selectRelations(ctx.db, 'parent'), id).map((child) =>
    presented(ctx, requireItem(ctx.db, child), at),
  );
}

// A move into a state that declares requires: children_closed waits for every child, whatever the
// state's turn: every way in (a UI move, an agent move, a relay) passes through here.
export function assertMayEnter(
  ctx: Context,
  item: ItemRecord,
  workflow: Workflow,
  to: string,
  at: string,
): void {
  if (requirementOf(workflow, to) !== 'children_closed') return;
  assertChildrenClosed(item.id, to, childrenOf(ctx, item.id, at));
}

// Each item with its relations and, for a parent, its children summary, only when it has them.
export function withRelations(
  items: readonly Item[],
  relations: readonly Relation[],
  closingOf: (id: string) => { closes?: Closing },
): Item[] {
  if (relations.length === 0) return [...items];
  return items.map((item) => {
    const refs = refsOf(relations, item.id);
    if (refs.length === 0) return item;
    const children = childIds(relations, item.id).map(closingOf);
    return {
      ...item,
      relations: refs,
      ...(children.length > 0 ? { children: childrenSummary(children) } : {}),
    };
  });
}
