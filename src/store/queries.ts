import type { DatabaseSync } from 'node:sqlite';
import type { Channel } from '../core/authority.ts';
import type { EvidenceKind, EvidenceRole } from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import type { Lease } from '../core/lease.ts';
import type { Relation, RelationKind } from '../core/relations.ts';

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
  type: string;
  title: string;
  fields: Record<string, unknown>;
  presetVersion: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  lease: Lease | null;
};

type ItemRow = {
  id: string;
  collection: string;
  seq: number;
  type: string;
  title: string;
  fields: string;
  preset_version: number;
  state: string;
  created_at: string;
  updated_at: string;
  created_by_kind: Actor['kind'];
  created_by_name: string;
  lease_holder: string | null;
  lease_expires_at: string | null;
};

function toItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    collection: row.collection,
    seq: row.seq,
    type: row.type,
    title: row.title,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    presetVersion: row.preset_version,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: { kind: row.created_by_kind, name: row.created_by_name },
    lease:
      row.lease_holder === null || row.lease_expires_at === null
        ? null
        : { holder: row.lease_holder, expiresAt: row.lease_expires_at },
  };
}

export function insertItem(db: DatabaseSync, item: ItemRecord): void {
  db.prepare(
    `INSERT INTO items (id, collection, seq, type, title, fields, preset_version, state,
      created_at, updated_at, created_by_kind, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.collection,
    item.seq,
    item.type,
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

export type ItemFilter = { collection?: string; state?: string; type?: string };

export function selectItems(db: DatabaseSync, filter: ItemFilter): ItemRecord[] {
  const sql = `SELECT * FROM items
    WHERE (:collection IS NULL OR collection = :collection) AND (:state IS NULL OR state = :state)
      AND (:type IS NULL OR type = :type)
    ORDER BY created_at, rowid`;
  const params = {
    collection: filter.collection ?? null,
    state: filter.state ?? null,
    type: filter.type ?? null,
  };
  return (db.prepare(sql).all(params) as ItemRow[]).map(toItem);
}

export function updateItemState(db: DatabaseSync, id: string, state: string, at: string): void {
  db.prepare('UPDATE items SET state = ?, updated_at = ? WHERE id = ?').run(state, at, id);
}

// Takes the lease only if it is free, expired or already the holder's: one conditional write, so
// two writers racing for the same item cannot both win.
export function takeLease(db: DatabaseSync, id: string, lease: Lease, at: string): boolean {
  const sql = `UPDATE items SET lease_holder = :holder, lease_expires_at = :expiresAt
    WHERE id = :id AND (lease_holder IS NULL OR lease_expires_at <= :at OR lease_holder = :holder)`;
  return db.prepare(sql).run({ id, at, ...lease }).changes === 1;
}

export function clearLease(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE items SET lease_holder = NULL, lease_expires_at = NULL WHERE id = ?').run(id);
}

export type ItemContent = {
  title: string;
  fields: Record<string, unknown>;
  presetVersion: number;
  updatedAt: string;
};

export function updateItemContent(db: DatabaseSync, id: string, content: ItemContent): void {
  db.prepare(
    'UPDATE items SET title = ?, fields = ?, preset_version = ?, updated_at = ? WHERE id = ?',
  ).run(
    content.title,
    JSON.stringify(content.fields),
    content.presetVersion,
    content.updatedAt,
    id,
  );
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

export type EventFilter = { item?: string; collection?: string; since?: number; limit?: number };

// Ids follow commit order (writers are serialized by BEGIN IMMEDIATE), so the last id read is a
// cursor: nothing committed later can land below it.
export function selectEventsAfter(db: DatabaseSync, filter: EventFilter): EventRecord[] {
  const sql = `SELECT events.* FROM events JOIN items ON items.id = events.item_id
    WHERE events.id > :since AND (:item IS NULL OR events.item_id = :item)
      AND (:collection IS NULL OR items.collection = :collection)
    ORDER BY events.id LIMIT :limit`;
  const params = {
    since: filter.since ?? 0,
    item: filter.item ?? null,
    collection: filter.collection ?? null,
    limit: filter.limit ?? -1,
  };
  return (db.prepare(sql).all(params) as EventRow[]).map(toEvent);
}

// When each item entered its current state: the time of its last created or transitioned event.
export function selectStateEntries(db: DatabaseSync): Map<string, string> {
  const sql = `SELECT item_id, at FROM events WHERE id IN (
    SELECT max(id) FROM events WHERE type IN ('created', 'transitioned') GROUP BY item_id)`;
  const rows = db.prepare(sql).all() as Array<{ item_id: string; at: string }>;
  return new Map(rows.map((row) => [row.item_id, row.at]));
}

export type EvidenceRecord = {
  id: number;
  itemId: string;
  role: EvidenceRole;
  // The id of the layout module it was attached to; null before modules, or for a type without any.
  module: string | null;
  kind: EvidenceKind;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  caption: string | null;
  createdAt: string;
  actor: Actor;
  channel: Channel;
};

type EvidenceRow = {
  id: number;
  item_id: string;
  role: EvidenceRole;
  module: string | null;
  kind: EvidenceKind;
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
  caption: string | null;
  created_at: string;
  actor_kind: Actor['kind'];
  actor_name: string;
  channel: Channel;
};

function toEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    role: row.role,
    module: row.module,
    kind: row.kind,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    sha256: row.sha256,
    caption: row.caption,
    createdAt: row.created_at,
    actor: { kind: row.actor_kind, name: row.actor_name },
    channel: row.channel,
  };
}

export function insertEvidence(db: DatabaseSync, evidence: Omit<EvidenceRecord, 'id'>): number {
  const sql = `INSERT INTO evidence (item_id, role, module, kind, filename, content_type, size,
      sha256, caption, created_at, actor_kind, actor_name, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`;
  const row = db
    .prepare(sql)
    .get(
      evidence.itemId,
      evidence.role,
      evidence.module,
      evidence.kind,
      evidence.filename,
      evidence.contentType,
      evidence.size,
      evidence.sha256,
      evidence.caption,
      evidence.createdAt,
      evidence.actor.kind,
      evidence.actor.name,
      evidence.channel,
    );
  return Number(row?.id);
}

export function findEvidence(db: DatabaseSync, id: number): EvidenceRecord | undefined {
  const row = db.prepare('SELECT * FROM evidence WHERE id = ?').get(id);
  return row && toEvidence(row as EvidenceRow);
}

export function selectEvidence(db: DatabaseSync, itemId: string): EvidenceRecord[] {
  const sql = 'SELECT * FROM evidence WHERE item_id = ? ORDER BY id';
  return (db.prepare(sql).all(itemId) as EvidenceRow[]).map(toEvidence);
}

// A stored relation and who made it.
export type RelationRecord = Relation & { createdAt: string; actor: Actor; channel: Channel };

type RelationRow = {
  kind: RelationKind;
  from_id: string;
  to_id: string;
  created_at: string;
  actor_kind: Actor['kind'];
  actor_name: string;
  channel: Channel;
};

function toRelation(row: RelationRow): RelationRecord {
  return {
    kind: row.kind,
    from: row.from_id,
    to: row.to_id,
    createdAt: row.created_at,
    actor: { kind: row.actor_kind, name: row.actor_name },
    channel: row.channel,
  };
}

export function insertRelation(db: DatabaseSync, relation: RelationRecord): void {
  db.prepare(
    `INSERT INTO relations (kind, from_id, to_id, created_at, actor_kind, actor_name, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    relation.kind,
    relation.from,
    relation.to,
    relation.createdAt,
    relation.actor.kind,
    relation.actor.name,
    relation.channel,
  );
}

export function deleteRelation(db: DatabaseSync, { kind, from, to }: Relation): void {
  db.prepare('DELETE FROM relations WHERE kind = ? AND from_id = ? AND to_id = ?').run(
    kind,
    from,
    to,
  );
}

// Every relation, oldest first; `kind` narrows them to one kind.
export function selectRelations(db: DatabaseSync, kind?: RelationKind): RelationRecord[] {
  const sql = `SELECT * FROM relations WHERE (:kind IS NULL OR kind = :kind)
    ORDER BY created_at, rowid`;
  return (db.prepare(sql).all({ kind: kind ?? null }) as RelationRow[]).map(toRelation);
}

// The relations an item takes part in, from either side, oldest first.
export function selectRelationsOf(db: DatabaseSync, id: string): RelationRecord[] {
  const sql = `SELECT * FROM relations WHERE from_id = :id OR to_id = :id
    ORDER BY created_at, rowid`;
  return (db.prepare(sql).all({ id }) as RelationRow[]).map(toRelation);
}
