import type { DatabaseSync } from 'node:sqlite';
import { authorizeMove, type Channel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { type FieldValues, intake } from '../core/fields.ts';
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
    const workflow = workflowOf(ctx, item.collection);
    const { actor, channel, reason } = input;
    authorizeMove(workflow, item.state, input.to, { actor, channel }, reason);
    const at = now();
    updateItemState(db, item.id, input.to, at);
    appendEvent(db, {
      itemId: item.id,
      type: 'transitioned',
      actor: input.actor,
      at,
      data: { from: item.state, to: input.to, ...(reason ? { reason } : {}) },
    });
    return withTurn({ ...item, state: input.to, updatedAt: at }, workflow);
  });
}
