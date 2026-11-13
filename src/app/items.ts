import type { DatabaseSync } from 'node:sqlite';
import { authorizeMove, type Channel, type Move, type Performer } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { assertCanLeave, type FieldValues, intake, revise } from '../core/fields.ts';
import { assertStandsAlone } from '../core/hierarchy.ts';
import { type Actor, formatItemId } from '../core/item.ts';
import { activeLease, assertMayWrite, type Lease } from '../core/lease.ts';
import { type ItemType, typeFor, typeOf } from '../core/preset.ts';
import { type ChildrenSummary, childrenSummary, type RelationRef } from '../core/relations.ts';
import { itemMoves } from '../core/views.ts';
import { type Closing, closesOf, type Turn, turnOf, type Workflow } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  claimNextSeq,
  clearLease,
  type EventRecord,
  type EvidenceRecord,
  findItem,
  type ItemRecord,
  insertItem,
  listCollections,
  selectEvents,
  selectEvidence,
  selectItems,
  selectRelations,
  selectStateEntries,
  updateItemContent,
  updateItemState,
} from '../store/queries.ts';
import { getCollection, presetOf, typeOfItem } from './collections.ts';
import type { Context } from './context.ts';
import { presentEvidence } from './evidence.ts';
import {
  assertBranchMayChange,
  assertMayStandAlone,
  assertMoveHandsOff,
  type BoardBlock,
  boardBlockOf,
  boardFieldInput,
  boardStart,
  boardState,
} from './next.ts';
import {
  addRelation,
  assertMayEnter,
  childIds,
  childrenOf,
  type RelatedItem,
  refsOf,
  relatedItems,
  withRelations,
} from './relations.ts';

export type Clock = () => string;

// turn and closes are derived from the state: whose turn it is and, once closed, how it closed.
// Lists add the item's relations and, for a parent, how far its children got, when it has them.
export type Item = ItemRecord & {
  turn: Turn;
  closes?: Closing;
  // A lease that ran out with nobody releasing it (expiry is lazy, so it stays stored until a
  // release, a handoff or a new claim): readers see lease null and this, the abandoned hold.
  expiredLease?: Lease;
  relations?: RelationRef[];
  children?: ChildrenSummary;
};

export type ItemWithEvents = Item & { events: EventRecord[] };

export const systemClock: Clock = () => new Date().toISOString();

// What readers see: the turn (and, once closed, how) derived from the state, and only a lease that
// is still active at `at`; one that ran out without a release is kept apart, as expiredLease.
export function present(item: ItemRecord, workflow: Workflow, at: string): Item {
  const lease = activeLease(item.lease, at);
  const presented: Item = { ...item, turn: turnOf(workflow, item.state), lease };
  if (item.lease && !lease) presented.expiredLease = item.lease;
  const closes = closesOf(workflow, item.state);
  if (closes !== undefined) presented.closes = closes;
  return presented;
}

export function requireItem(db: DatabaseSync, id: string): ItemRecord {
  const item = findItem(db, id);
  if (!item)
    throw new OteaError('not_found', `Item "${id}" not found`, { kind: 'item_missing', item: id });
  return item;
}

// The workflow an item follows: its type's.
export function workflowOf(ctx: Context, item: Pick<ItemRecord, 'collection' | 'type'>): Workflow {
  return typeOfItem(ctx, item).workflow;
}

// `type` may be left out when the collection's preset has a single type. `parent` creates the item
// as a child of that item, in the same write; a type that may not stand alone needs one.
export type CreateItemInput = {
  collection: string;
  type?: string;
  title: string;
  fields?: FieldValues;
  parent?: string;
  actor: Actor;
  channel?: Channel;
};

// Writes the item, its created event and its parent link, inside the caller's transaction.
export function insertNewItem(
  ctx: Context,
  input: CreateItemInput,
  at: string,
): { item: ItemRecord; created: Item } {
  const { db } = ctx;
  const collection = getCollection(db, input.collection);
  const preset = presetOf(ctx, collection);
  const type = typeFor(preset, input.type);
  if (input.parent === undefined) assertStandsAlone(preset, type);
  assertMayStandAlone(ctx, collection.name, input.parent);
  const given = boardFieldInput(ctx, collection.name, input.fields ?? {});
  const taken = intake(type, { ...given, title: input.title });
  const { title, fields } = taken;
  // On a board the engine says where the item starts.
  const state = boardStart(ctx, collection.name, { ...fields, title }) ?? taken.state;
  const seq = claimNextSeq(db, collection.name);
  const item: ItemRecord = {
    id: formatItemId(collection.prefix, seq),
    collection: collection.name,
    seq,
    type: type.name,
    title,
    fields,
    presetVersion: preset.version,
    state,
    createdAt: at,
    updatedAt: at,
    createdBy: input.actor,
    lease: null,
  };
  insertItem(db, item);
  const { channel } = input;
  const data = channel === undefined ? { state } : { state, channel };
  appendEvent(db, { itemId: item.id, type: 'created', actor: input.actor, at, data });
  const created = present(item, type.workflow, at);
  if (input.parent === undefined) return { item, created };
  const parent = { kind: 'parent' as const, from: item.id, to: input.parent };
  addRelation(ctx, parent, { actor: input.actor, channel: channel ?? 'cli' }, at);
  return { item, created: { ...created, relations: refsOf([parent], item.id) } };
}

export function createItem(ctx: Context, input: CreateItemInput, now = systemClock): Item {
  return transaction(ctx.db, () => insertNewItem(ctx, input, now()).created);
}

// `availableTo` hides items whose active lease is held by anyone other than that actor; `parent`
// keeps the children of that item; `fields` keeps the items whose fields hold every value given,
// exactly as stored (title included).
export type ListItemsFilter = {
  collection?: string;
  state?: string;
  type?: string;
  turn?: Turn;
  availableTo?: string;
  parent?: string;
  fields?: Record<string, string>;
};

function holdsFields(item: ItemRecord, fields: Record<string, string>): boolean {
  return Object.entries(fields).every(
    ([key, value]) => (key === 'title' ? item.title : item.fields[key]) === value,
  );
}

export function listItems(ctx: Context, filter: ListItemsFilter = {}, now = systemClock): Item[] {
  const presets = new Map(
    listCollections(ctx.db).map((record) => [record.name, presetOf(ctx, record)]),
  );
  const workflowFor = ({ collection, type }: ItemRecord): Workflow => {
    const preset = presets.get(collection);
    if (!preset) throw new OteaError('not_found', `Collection "${collection}" not found`);
    return typeOf(preset, type).workflow;
  };
  const { turn, availableTo, parent, fields, ...stored } = filter;
  if (parent !== undefined) requireItem(ctx.db, parent);
  const relations = selectRelations(ctx.db);
  const children = parent === undefined ? undefined : new Set(childIds(relations, parent));
  const at = now();
  const items = selectItems(ctx.db, stored)
    .map((item) => present(item, workflowFor(item), at))
    .filter((item) => turn === undefined || item.turn === turn)
    .filter(({ lease }) => availableTo === undefined || !lease || lease.holder === availableTo)
    .filter(({ id }) => children === undefined || children.has(id))
    .filter((item) => fields === undefined || holdsFields(item, fields));
  if (relations.length === 0) return items;
  // A child may sit outside the filter, so the summaries read every item.
  const closings = new Map(
    selectItems(ctx.db, {}).map((item) => [item.id, present(item, workflowFor(item), at)]),
  );
  return withRelations(items, relations, (id) => closings.get(id) ?? {});
}

// The matching item that has waited longest: the first to enter its current state, ties going to
// the first created. Field updates and leases do not reset the wait.
export function oldestWaiting(
  ctx: Context,
  filter: ListItemsFilter,
  now = systemClock,
): Item | undefined {
  const entered = selectStateEntries(ctx.db);
  const since = (item: Item) => entered.get(item.id) ?? item.createdAt;
  return listItems(ctx, filter, now).reduce<Item | undefined>(
    (oldest, item) => (oldest === undefined || since(item) < since(oldest) ? item : oldest),
    undefined,
  );
}

export function getItem(ctx: Context, id: string, now = systemClock): ItemWithEvents {
  const item = requireItem(ctx.db, id);
  const workflow = workflowOf(ctx, item);
  return { ...present(item, workflow, now()), events: selectEvents(ctx.db, id) };
}

// `transitions` are the moves the performer may make, `relayable` the human decisions an agent
// may relay, `evidence` the files attached to the item, oldest first, each with the module that draws
// it, `relations` its links with where each other item stands, `children`, for a parent, how far
// its children got, and `gates`, when its workflow declares them, which actions its state allows.
export type ItemView = ItemWithEvents & {
  transitions: Move[];
  relayable: Move[];
  missing: string[];
  evidence: EvidenceRecord[];
  relations: RelatedItem[];
  gates?: Record<string, boolean>;
  // On a published board: its parts, blockers, round notes, branch and gates (PLAN §9.1).
  board?: BoardBlock;
};

export function showItem(
  ctx: Context,
  id: string,
  performer: Performer,
  now = systemClock,
): ItemView {
  const at = now();
  const item = getItem(ctx, id, () => at);
  const type = typeOfItem(ctx, item);
  const children = childrenOf(ctx, item.id, at);
  const { gates, ...moves } = itemMoves(type, item.state, item.fields, performer);
  const board = boardBlockOf(ctx, item);
  return {
    ...item,
    ...moves,
    evidence: presentEvidence(type.layout, selectEvidence(ctx.db, item.id)),
    relations: relatedItems(ctx, item.id, at),
    ...(children.length > 0 ? { children: childrenSummary(children) } : {}),
    ...(gates === undefined ? {} : { gates }),
    ...(board === undefined ? {} : { board }),
  };
}

export type UpdateItemInput = { id: string; title?: string; fields?: FieldValues; actor: Actor };

export function updateItem(ctx: Context, input: UpdateItemInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const preset = presetOf(ctx, getCollection(db, item.collection));
    const type: ItemType = typeOf(preset, item.type);
    const at = now();
    assertMayWrite(item.id, activeLease(item.lease, at), input.actor);
    if (turnOf(type.workflow, item.state) === 'none') {
      throw new OteaError(
        'item_closed',
        `${item.id} is ${item.state} (turn none) and can no longer be updated`,
        { kind: 'closed', item: item.id },
      );
    }
    const fields = boardFieldInput(ctx, item.collection, input.fields ?? {});
    assertBranchMayChange(ctx, item, fields, input.actor);
    const changes = {
      ...fields,
      ...(input.title === undefined ? {} : { title: input.title }),
    };
    const revision = revise(type, item, changes);
    if (Object.keys(revision.changes).length === 0) return present(item, type.workflow, at);
    const content = {
      title: revision.title,
      fields: revision.fields,
      presetVersion: preset.version,
      updatedAt: at,
    };
    updateItemContent(db, item.id, content);
    appendEvent(db, {
      itemId: item.id,
      type: 'updated',
      actor: input.actor,
      at,
      data: { changes: revision.changes },
    });
    return present({ ...item, ...content }, type.workflow, at);
  });
}

export type MoveItemInput = {
  id: string;
  to: string;
  actor: Actor;
  channel: Channel;
  reason?: string;
  // On a board: the note of a handoff, kept with the round (a step that asks for one reads the
  // reason when no note is given).
  note?: string;
};

// Lands an authorized move: the new state, its transitioned event and, when the item leaves the agent
// turn, the release of the lease it carried. `trail` (who relayed it) is recorded on both.
export function landMove(
  db: DatabaseSync,
  workflow: Workflow,
  item: ItemRecord,
  move: { to: string; actor: Actor; at: string; lease: Lease | null },
  data: Record<string, unknown>,
  trail: Record<string, unknown> = {},
): Item {
  const { to, actor, at, lease } = move;
  updateItemState(db, item.id, to, at);
  appendEvent(db, {
    itemId: item.id,
    type: 'transitioned',
    actor,
    at,
    data: { from: item.state, to, ...data, ...trail },
  });
  const handoff = lease !== null && turnOf(workflow, to) !== 'agent';
  if (handoff) {
    clearLease(db, item.id);
    const released = { holder: lease.holder, cause: 'handoff', ...trail };
    appendEvent(db, { itemId: item.id, type: 'released', actor, at, data: released });
  }
  const moved = { ...item, state: to, updatedAt: at, lease: handoff ? null : item.lease };
  return present(moved, workflow, at);
}

export function moveItem(ctx: Context, input: MoveItemInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const type = typeOfItem(ctx, item);
    const { workflow } = type;
    const { actor, channel, reason } = input;
    const to = boardState(ctx, item.collection, input.to);
    const at = now();
    const lease = activeLease(item.lease, at);
    assertMayWrite(item.id, lease, actor);
    // On a board, the step engine says first, in the board's words, why a move is not this actor's.
    const note = assertMoveHandsOff(ctx, item, to, actor, {
      ...(reason === undefined ? {} : { reason }),
      ...(input.note === undefined ? {} : { note: input.note }),
    });
    authorizeMove(workflow, item.state, to, { actor, channel }, reason);
    assertCanLeave(type, item.state, to, item.fields);
    assertMayEnter(ctx, item, workflow, to, at);
    const data = { ...(reason ? { reason } : {}), ...(note ? { note } : {}), channel };
    return landMove(db, workflow, item, { to, actor, at, lease }, data);
  });
}
