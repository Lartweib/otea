import type { DatabaseSync } from 'node:sqlite';
import type { Workflow } from '../core/workflow.ts';

export type CollectionRecord = {
  name: string;
  prefix: string;
  workflow: Workflow;
  nextSeq: number;
};

type CollectionRow = { name: string; prefix: string; workflow: string; next_seq: number };

function toCollection(row: CollectionRow): CollectionRecord {
  return {
    name: row.name,
    prefix: row.prefix,
    workflow: JSON.parse(row.workflow) as Workflow,
    nextSeq: row.next_seq,
  };
}

export function insertCollection(db: DatabaseSync, collection: CollectionRecord): void {
  db.prepare('INSERT INTO collections (name, prefix, workflow, next_seq) VALUES (?, ?, ?, ?)').run(
    collection.name,
    collection.prefix,
    JSON.stringify(collection.workflow),
    collection.nextSeq,
  );
}

export function findCollection(db: DatabaseSync, name: string): CollectionRecord | undefined {
  const row = db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
  return row && toCollection(row as CollectionRow);
}

export function collectionTaken(db: DatabaseSync, name: string, prefix: string): boolean {
  const sql = 'SELECT 1 FROM collections WHERE name = ? OR prefix = ?';
  return db.prepare(sql).get(name, prefix) !== undefined;
}
