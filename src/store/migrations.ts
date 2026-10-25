import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './database.ts';

const MIGRATIONS = [
  `
  CREATE TABLE collections (
    name TEXT PRIMARY KEY,
    prefix TEXT NOT NULL UNIQUE,
    workflow TEXT NOT NULL,
    next_seq INTEGER NOT NULL
  );

  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL REFERENCES collections (name),
    seq INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by_kind TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    UNIQUE (collection, seq)
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL REFERENCES items (id),
    type TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    at TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE INDEX events_item_id ON events (item_id);

  CREATE TRIGGER events_no_update BEFORE UPDATE ON events
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;

  CREATE TRIGGER events_no_delete BEFORE DELETE ON events
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
  `,
];

function userVersion(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
}

export function migrate(db: DatabaseSync): void {
  const current = userVersion(db);
  for (const [offset, sql] of MIGRATIONS.slice(current).entries()) {
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + offset + 1}`);
    });
  }
}
