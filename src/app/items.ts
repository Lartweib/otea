import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { type Actor, formatItemId } from '../core/item.ts';
import { assertTransition, type Turn, turnOf, type Workflow } from '../core/workflow.ts';
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
import { getCollection } from './collections.ts';

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

export type CreateItemInput = { collection: string; title: string; body?: string; actor: Actor };

export function createItem(db: DatabaseSync, input: CreateItemInput, now = systemClock): Item {
  return transaction(db, () => {
    const { prefix, workflow } = getCollection(db, input.collection);
    const seq = claimNextSeq(db, input.collection);
    const at = now();
    const item: ItemRecord = {
      id: formatItemId(prefix, seq),
      collection: input.collection,
      seq,
      title: input.title,
      body: input.body ?? '',
      state: workflow.initial,
      createdAt: at,
      updatedAt: at,
      createdBy: input.actor,
    };
    insertItem(db, item);
    appendEvent(db, {
      itemId: item.id,
      type: 'created',
      actor: input.actor,
      at,
      data: { state: item.state },
    });
    return withTurn(item, workflow);
  });
}

export type ListItemsFilter = { collection?: string; state?: string; turn?: Turn };

export function listItems(db: DatabaseSync, filter: ListItemsFilter = {}): Item[] {
  const workflows = new Map(listCollections(db).map(({ name, workflow }) => [name, workflow]));
  const { turn, ...stored } = filter;
  return selectItems(db, stored)
    .map((item) => withTurn(item, workflows.get(item.collection) as Workflow))
    .filter((item) => turn === undefined || item.turn === turn);
}

export function getItem(db: DatabaseSync, id: string): ItemWithEvents {
  const item = requireItem(db, id);
  const { workflow } = getCollection(db, item.collection);
  return { ...withTurn(item, workflow), events: selectEvents(db, id) };
}

export type MoveItemInput = { id: string; to: string; actor: Actor };

export function moveItem(db: DatabaseSync, input: MoveItemInput, now = systemClock): Item {
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const { workflow } = getCollection(db, item.collection);
    assertTransition(workflow, item.state, input.to);
    const at = now();
    updateItemState(db, item.id, input.to, at);
    appendEvent(db, {
      itemId: item.id,
      type: 'transitioned',
      actor: input.actor,
      at,
      data: { from: item.state, to: input.to },
    });
    return withTurn({ ...item, state: input.to, updatedAt: at }, workflow);
  });
}
