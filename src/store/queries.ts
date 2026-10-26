import type { DatabaseSync } from 'node:sqlite';
import type { Actor } from '../core/item.ts';

export type CollectionRecord = {
  name: string;
  prefix: string;
  preset: string;
  presetVersion: number;
  nextSeq: number;
};

type CollectionRow = {
  name: string;
  prefix: string;
  preset: string;
  preset_version: number;
  next_seq: number;
};

function toCollection(row: CollectionRow): CollectionRecord {
  return {
    name: row.name,
    prefix: row.prefix,
    preset: row.preset,
    presetVersion: row.preset_version,
    nextSeq: row.next_seq,
  };
}

export function insertCollection(db: DatabaseSync, collection: CollectionRecord): void {
  db.prepare(
    'INSERT INTO collections (name, prefix, preset, preset_version, next_seq) VALUES (?, ?, ?, ?, ?)',
  ).run(
    collection.name,
    collection.prefix,
    collection.preset,
    collection.presetVersion,
    collection.nextSeq,
  );
}

export function findCollection(db: DatabaseSync, name: string): CollectionRecord | undefined {
  const row = db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
  return row && toCollection(row as CollectionRow);
}

export function listCollections(db: DatabaseSync): CollectionRecord[] {
  const rows = db.prepare('SELECT * FROM collections').all() as CollectionRow[];
  return rows.map(toCollection);
}

export function collectionTaken(db: DatabaseSync, name: string, prefix: string): boolean {
  const sql = 'SELECT 1 FROM collections WHERE name = ? OR prefix = ?';
  return db.prepare(sql).get(name, prefix) !== undefined;
}

export function claimNextSeq(db: DatabaseSync, collection: string): number {
  const sql = 'UPDATE collections SET next_seq = next_seq + 1 WHERE name = ? RETURNING next_seq';
  return Number(db.prepare(sql).get(collection)?.next_seq) - 1;
}

export type ItemRecord = {
  id: string;
  collection: string;
  seq: number;
  title: string;
  fields: Record<string, unknown>;
  presetVersion: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
};

type ItemRow = {
  id: string;
  collection: string;
  seq: number;
  title: string;
  fields: string;
  preset_version: number;
  state: string;
  created_at: string;
  updated_at: string;
  created_by_kind: Actor['kind'];
  created_by_name: string;
};

function toItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    collection: row.collection,
    seq: row.seq,
    title: row.title,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    presetVersion: row.preset_version,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: { kind: row.created_by_kind, name: row.created_by_name },
  };
}

export function insertItem(db: DatabaseSync, item: ItemRecord): void {
  db.prepare(
    `INSERT INTO items (id, collection, seq, title, fields, preset_version, state, created_at,
      updated_at, created_by_kind, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.collection,
    item.seq,
    item.title,
    JSON.stringify(item.fields),
    item.presetVersion,
    item.state,
    item.createdAt,
    item.updatedAt,
    item.createdBy.kind,
    item.createdBy.name,
  );
}

export function findItem(db: DatabaseSync, id: string): ItemRecord | undefined {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return row && toItem(row as ItemRow);
}

export type ItemFilter = { collection?: string; state?: string };

export function selectItems(db: DatabaseSync, filter: ItemFilter): ItemRecord[] {
  const sql = `SELECT * FROM items
    WHERE (:collection IS NULL OR collection = :collection) AND (:state IS NULL OR state = :state)
    ORDER BY created_at, rowid`;
  const params = { collection: filter.collection ?? null, state: filter.state ?? null };
  return (db.prepare(sql).all(params) as ItemRow[]).map(toItem);
}

export function updateItemState(db: DatabaseSync, id: string, state: string, at: string): void {
  db.prepare('UPDATE items SET state = ?, updated_at = ? WHERE id = ?').run(state, at, id);
}

export type EventRecord = {
  id: number;
  itemId: string;
  type: string;
  actor: Actor;
  at: string;
  data: Record<string, unknown>;
};

type EventRow = {
  id: number;
  item_id: string;
  type: string;
  actor_kind: Actor['kind'];
  actor_name: string;
  at: string;
  data: string;
};

function toEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    type: row.type,
    actor: { kind: row.actor_kind, name: row.actor_name },
    at: row.at,
    data: JSON.parse(row.data) as Record<string, unknown>,
  };
}

export function appendEvent(db: DatabaseSync, event: Omit<EventRecord, 'id'>): void {
  db.prepare(
    'INSERT INTO events (item_id, type, actor_kind, actor_name, at, data) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    event.itemId,
    event.type,
    event.actor.kind,
    event.actor.name,
    event.at,
    JSON.stringify(event.data),
  );
}

export function selectEvents(db: DatabaseSync, itemId: string): EventRecord[] {
  const sql = 'SELECT * FROM events WHERE item_id = ? ORDER BY id';
  return (db.prepare(sql).all(itemId) as EventRow[]).map(toEvent);
}
