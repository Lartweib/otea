import type { DatabaseSync } from 'node:sqlite';
import {
  authorizeMove,
  availableMoves,
  type Channel,
  type Move,
  type Performer,
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
import { type Turn, turnOf, type Workflow } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  claimNextSeq,
  type EventRecord,
  findItem,
  type ItemRecord,
  insertItem,
  listCollections,
  selectEvents,
  selectItems,
  updateItemContent,
  updateItemState,
} from '../store/queries.ts';
import { type Collection, getCollection, presetOf } from './collections.ts';
import type { Context } from './context.ts';

export type Clock = () => string;

export type Item = ItemRecord & { turn: Turn };

export type ItemWithEvents = Item & { events: EventRecord[] };

const systemClock: Clock = () => new Date().toISOString();

function withTurn(item: ItemRecord, workflow: Workflow): Item {
  return { ...item, turn: turnOf(workflow, item.state) };
}

function requireItem(db: DatabaseSync, id: string): ItemRecord {
  const item = findItem(db, id);
  if (!item) throw new OteaError('not_found', `Item "${id}" not found`);
  return item;
}

function workflowOf(ctx: Context, collection: string): Workflow {
  return presetOf(ctx, getCollection(ctx.db, collection)).workflow;
}

export type CreateItemInput = {
  collection: string;
  title: string;
  fields?: FieldValues;
  actor: Actor;
};

export function createItem(ctx: Context, input: CreateItemInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const collection = getCollection(db, input.collection);
    const preset = presetOf(ctx, collection);
    const { title, fields, state } = intake(preset, { ...input.fields, title: input.title });
    const seq = claimNextSeq(db, collection.name);
    const at = now();
    const item: ItemRecord = {
      id: formatItemId(collection.prefix, seq),
      collection: collection.name,
      seq,
      title,
      fields,
      presetVersion: preset.version,
      state,
      createdAt: at,
      updatedAt: at,
      createdBy: input.actor,
    };
    insertItem(db, item);
    appendEvent(db, { itemId: item.id, type: 'created', actor: input.actor, at, data: { state } });
    return withTurn(item, preset.workflow);
  });
}

export type ListItemsFilter = { collection?: string; state?: string; turn?: Turn };

export function listItems(ctx: Context, filter: ListItemsFilter = {}): Item[] {
  const collections = new Map(listCollections(ctx.db).map((record) => [record.name, record]));
  const workflows = new Map<string, Workflow>();
  const workflowFor = (name: string): Workflow => {
    const workflow =
      workflows.get(name) ?? presetOf(ctx, collections.get(name) as Collection).workflow;
    workflows.set(name, workflow);
    return workflow;
  };
  const { turn, ...stored } = filter;
  return selectItems(ctx.db, stored)
    .map((item) => withTurn(item, workflowFor(item.collection)))
    .filter((item) => turn === undefined || item.turn === turn);
}

export function getItem(ctx: Context, id: string): ItemWithEvents {
  const item = requireItem(ctx.db, id);
  return { ...withTurn(item, workflowOf(ctx, item.collection)), events: selectEvents(ctx.db, id) };
}

export type ItemView = ItemWithEvents & { transitions: Move[]; missing: string[] };

export function showItem(ctx: Context, id: string, performer: Performer): ItemView {
  const item = getItem(ctx, id);
  const preset = presetOf(ctx, getCollection(ctx.db, item.collection));
  return {
    ...item,
    transitions: availableMoves(preset.workflow, item.state, performer),
    missing: missingToComplete(preset, item.fields),
  };
}

export type UpdateItemInput = { id: string; title?: string; fields?: FieldValues; actor: Actor };

export function updateItem(ctx: Context, input: UpdateItemInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const preset = presetOf(ctx, getCollection(db, item.collection));
    if (turnOf(preset.workflow, item.state) === 'none') {
      throw new OteaError(
        'item_closed',
        `${item.id} is ${item.state} (turn none) and can no longer be updated`,
      );
    }
    const changes = {
      ...input.fields,
      ...(input.title === undefined ? {} : { title: input.title }),
    };
    const revision = revise(preset, item, changes);
    if (Object.keys(revision.changes).length === 0) return withTurn(item, preset.workflow);
    const at = now();
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
    return withTurn({ ...item, ...content }, preset.workflow);
  });
}

export type MoveItemInput = {
  id: string;
  to: string;
  actor: Actor;
  channel: Channel;
  reason?: string;
};

export function moveItem(ctx: Context, input: MoveItemInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const preset = presetOf(ctx, getCollection(db, item.collection));
    const { workflow } = preset;
    const { actor, channel, reason } = input;
    authorizeMove(workflow, item.state, input.to, { actor, channel }, reason);
    assertCanLeave(preset, item.state, input.to, item.fields);
    const at = now();
    updateItemState(db, item.id, input.to, at);
    appendEvent(db, {
      itemId: item.id,
      type: 'transitioned',
      actor: input.actor,
      at,
      data: { from: item.state, to: input.to, ...(reason ? { reason } : {}), channel },
    });
    return withTurn({ ...item, state: input.to, updatedAt: at }, workflow);
  });
}
