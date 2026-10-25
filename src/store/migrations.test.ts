import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.ts';
import { migrate } from './migrations.ts';

const userVersion = (db: DatabaseSync) => db.prepare('PRAGMA user_version').get()?.user_version;

const tables = (db: DatabaseSync) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);

describe('migrate', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => db.close());

  it('creates the schema and records its version', () => {
    migrate(db);

    expect(tables(db)).toEqual(expect.arrayContaining(['collections', 'items', 'events']));
    expect(userVersion(db)).toBe(1);
  });

  it('is idempotent', () => {
    migrate(db);
    migrate(db);

    expect(userVersion(db)).toBe(1);
  });

  describe('events', () => {
    beforeEach(() => {
      migrate(db);
      db.exec(`
        INSERT INTO collections (name, prefix, workflow, next_seq) VALUES ('tasks', 'TASKS', '{}', 2);
        INSERT INTO items (id, collection, seq, title, body, state, created_at, updated_at,
          created_by_kind, created_by_name)
        VALUES ('TASKS-1', 'tasks', 1, 'A', '', 'todo', 't', 't', 'human', 'ana');
        INSERT INTO events (item_id, type, actor_kind, actor_name, at, data)
        VALUES ('TASKS-1', 'created', 'human', 'ana', 't', '{}');
      `);
    });

    it('rejects updates', () => {
      expect(() => db.exec("UPDATE events SET type = 'edited'")).toThrow(/append-only/);
    });

    it('rejects deletes', () => {
      expect(() => db.exec('DELETE FROM events')).toThrow(/append-only/);
    });

    it('references existing items', () => {
      const orphan = `INSERT INTO events (item_id, type, actor_kind, actor_name, at, data)
        VALUES ('TASKS-9', 'created', 'human', 'ana', 't', '{}')`;

      expect(() => db.exec(orphan)).toThrow(/FOREIGN KEY/);
    });
  });
});
