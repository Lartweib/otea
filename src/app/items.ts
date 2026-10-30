import type { DatabaseSync } from 'node:sqlite';
import {
  authorizeMove,
  availableMoves,
  type Channel,
  type Move,
  type Performer,
  relayableMoves,
} from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import {
  assertCanLeave,
  type FieldValues,
  intake,
  missingToComplete,
  revise,
} from '../core/fields.ts';
import { type Actor, formatItemId } from '../core/item.ts';
import { activeLease, assertMayWrite, type Lease } from '../core/lease.ts';
import { type ItemType, typeFor, typeOf } from '../core/preset.ts';
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
  selectStateEntries,
  updateItemContent,
  updateItemState,
} from '../store/queries.ts';
import { getCollection, presetOf, typeOfItem } from './collections.ts';
import type { Context } from './context.ts';

export type Clock = () => string;

// turn and closes are derived from the state: whose turn it is and, once closed, how it closed.
export type Item = ItemRecord & { turn: Turn; closes?: Closing };

export type ItemWithEvents = Item & { events: EventRecord[] };

export const systemClock: Clock = () => new Date().toISOString();

// What readers see: the turn (and, once closed, how) derived from the state, and only a lease that
// is still active at `at`.
export function present(item: ItemRecord, workflow: Workflow, at: string): Item {
  const presented: Item = {
    ...item,
    turn: turnOf(workflow, item.state),
    lease: activeLease(item.lease, at),
  };
  const closes = closesOf(workflow, item.state);
  if (closes !== undefined) presented.closes = closes;
  return presented;
}

export function requireItem(db: DatabaseSync, id: string): ItemRecord {
  const item = findItem(db, id);
  if (!item) throw new OteaError('not_found', `Item "${id}" not found`);
  return item;
}

// The workflow an item follows: its type's.
export function workflowOf(ctx: Context, item: Pick<ItemRecord, 'collection' | 'type'>): Workflow {
  return typeOfItem(ctx, item).workflow;
}

// `type` may be left out when the collection's preset has a single type.
export type CreateItemInput = {
  collection: string;
  type?: string;
  title: string;
  fields?: FieldValues;
  actor: Actor;
  channel?: Channel;
};

export function createItem(ctx: Context, input: CreateItemInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const collection = getCollection(db, input.collection);
    const preset = presetOf(ctx, collection);
    const type = typeFor(preset, input.type);
    const { title, fields, state } = intake(type, { ...input.fields, title: input.title });
    const seq = claimNextSeq(db, collection.name);
    const at = now();
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
    return present(item, type.workflow, at);
  });
}

// `availableTo` hides items whose active lease is held by anyone other than that actor.
export type ListItemsFilter = {
  collection?: string;
  state?: string;
  type?: string;
  turn?: Turn;
  availableTo?: string;
};

export function listItems(ctx: Context, filter: ListItemsFilter = {}, now = systemClock): Item[] {
  const presets = new Map(
    listCollections(ctx.db).map((record) => [record.name, presetOf(ctx, record)]),
  );
  const workflowFor = ({ collection, type }: ItemRecord): Workflow => {
    const preset = presets.get(collection);
    if (!preset) throw new OteaError('not_found', `Collection "${collection}" not found`);
    return typeOf(preset, type).workflow;
  };
  const { turn, availableTo, ...stored } = filter;
  const at = now();
  return selectItems(ctx.db, stored)
    .map((item) => present(item, workflowFor(item), at))
    .filter((item) => turn === undefined || item.turn === turn)
    .filter(({ lease }) => availableTo === undefined || !lease || lease.holder === availableTo);
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
// may relay, `evidence` the files attached to the item, oldest first.
export type ItemView = ItemWithEvents & {
  transitions: Move[];
  relayable: Move[];
  missing: string[];
  evidence: EvidenceRecord[];
};

export function showItem(
  ctx: Context,
  id: string,
  performer: Performer,
  now = systemClock,
): ItemView {
  const item = getItem(ctx, id, now);
  const type = typeOfItem(ctx, item);
  return {
    ...item,
    transitions: availableMoves(type.workflow, item.state, performer),
    relayable: relayableMoves(type.workflow, item.state),
    missing: missingToComplete(type, item.fields),
    evidence: selectEvidence(ctx.db, item.id),
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
      );
    }
    const changes = {
      ...input.fields,
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
    const { actor, channel, reason, to } = input;
    const at = now();
    const lease = activeLease(item.lease, at);
    assertMayWrite(item.id, lease, actor);
    authorizeMove(workflow, item.state, to, { actor, channel }, reason);
    assertCanLeave(type, item.state, to, item.fields);
    const data = { ...(reason ? { reason } : {}), channel };
    return landMove(db, workflow, item, { to, actor, at, lease }, data);
  });
}
