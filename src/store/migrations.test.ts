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

    expect(tables(db)).toEqual(
      expect.arrayContaining(['collections', 'items', 'events', 'evidence', 'relations']),
    );
    expect(userVersion(db)).toBe(7);
  });

  it('is idempotent', () => {
    migrate(db);
    migrate(db);

    expect(userVersion(db)).toBe(7);
  });

  describe('from version 1', () => {
    beforeEach(() => {
      migrate(db, 1);
      db.exec(`
        INSERT INTO collections (name, prefix, workflow, next_seq) VALUES ('tasks', 'TASKS', '{}', 3);
        INSERT INTO items (id, collection, seq, title, body, state, created_at, updated_at,
          created_by_kind, created_by_name)
        VALUES
          ('TASKS-1', 'tasks', 1, 'A', '', 'todo', 't', 't', 'human', 'ana'),
          ('TASKS-2', 'tasks', 2, 'B', 'Details', 'review', 't', 't', 'agent', 'bot');
        INSERT INTO events (item_id, type, actor_kind, actor_name, at, data)
        VALUES ('TASKS-1', 'created', 'human', 'ana', 't', '{"state":"todo"}');
      `);
      migrate(db);
    });

    it('moves collections to the tasks preset version 1', () => {
      expect(db.prepare('SELECT * FROM collections').all()).toEqual([
        { name: 'tasks', prefix: 'TASKS', next_seq: 3, preset: 'tasks', preset_version: 1 },
      ]);
    });

    it('gives items preset fields, keeping a body as the description', () => {
      const rows = db.prepare('SELECT id, fields, preset_version FROM items ORDER BY id').all();

      expect(rows).toEqual([
        { id: 'TASKS-1', fields: '{}', preset_version: 1 },
        { id: 'TASKS-2', fields: '{"description":"Details"}', preset_version: 1 },
      ]);
    });

    it('drops the replaced columns and keeps events', () => {
      const columns = (table: string) =>
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((column) => column.name);

      expect(columns('collections')).not.toContain('workflow');
      expect(columns('items')).not.toContain('body');
      expect(db.prepare('SELECT count(*) AS n FROM events').get()?.n).toBe(1);
    });
  });

  describe('from version 2', () => {
    beforeEach(() => {
      migrate(db, 2);
      db.exec(`
        INSERT INTO collections (name, prefix, preset, preset_version, next_seq)
        VALUES ('tasks', 'TASKS', 'tasks', 1, 2);
        INSERT INTO items (id, collection, seq, title, fields, preset_version, state, created_at,
          updated_at, created_by_kind, created_by_name)
        VALUES ('TASKS-1', 'tasks', 1, 'A', '{}', 1, 'todo', 't', 't', 'human', 'ana');
      `);
      migrate(db);
    });

    it('adds an empty lease to existing items', () => {
      expect(db.prepare('SELECT id, lease_holder, lease_expires_at FROM items').all()).toEqual([
        { id: 'TASKS-1', lease_holder: null, lease_expires_at: null },
      ]);
    });
  });

  describe('from version 3', () => {
    const ITEM = `INSERT INTO items (id, collection, seq, title, fields, preset_version, state,
      created_at, updated_at, created_by_kind, created_by_name)
      VALUES ('TASKS-1', 'tasks', 1, 'A', '{}', 1, 'todo', 't', 't', 'human', 'ana')`;
    const evidenceOf = (item: string) => `INSERT INTO evidence (item_id, role, kind, filename,
      content_type, size, sha256, caption, created_at, actor_kind, actor_name, channel)
      VALUES ('${item}', 'single', 'log', 'a.log', 'text/plain', 1, 'abc', NULL, 't', 'agent',
        'bot', 'cli')`;

    beforeEach(() => {
      migrate(db, 3);
      db.exec(`
        INSERT INTO collections (name, prefix, preset, preset_version, next_seq)
        VALUES ('tasks', 'TASKS', 'tasks', 1, 2);
        ${ITEM};
      `);
      migrate(db);
    });

    it('adds an empty evidence table and keeps the items', () => {
      expect(db.prepare('SELECT count(*) AS n FROM evidence').get()?.n).toBe(0);
      expect(db.prepare('SELECT id FROM items').all()).toEqual([{ id: 'TASKS-1' }]);
    });

    it('keeps evidence append-only, on existing items', () => {
      db.exec(evidenceOf('TASKS-1'));

      expect(() => db.exec("UPDATE evidence SET caption = 'x'")).toThrow(/append-only/);
      expect(() => db.exec('DELETE FROM evidence')).toThrow(/append-only/);
      expect(() => db.exec(evidenceOf('TASKS-9'))).toThrow(/FOREIGN KEY/);
    });
  });

  describe('from version 4', () => {
    beforeEach(() => {
      migrate(db, 4);
      db.exec(`
        INSERT INTO collections (name, prefix, preset, preset_version, next_seq)
        VALUES ('tasks', 'TASKS', 'tasks', 1, 2);
        INSERT INTO items (id, collection, seq, title, fields, preset_version, state, created_at,
          updated_at, created_by_kind, created_by_name)
        VALUES ('TASKS-1', 'tasks', 1, 'A', '{}', 1, 'todo', 't', 't', 'human', 'ana');
      `);
      migrate(db);
    });

    it('gives existing items the type of a preset without types', () => {
      expect(db.prepare('SELECT id, type FROM items').all()).toEqual([
        { id: 'TASKS-1', type: 'item' },
      ]);
    });
  });

  describe('from version 5', () => {
    beforeEach(() => {
      migrate(db, 5);
      db.exec(`
        INSERT INTO collections (name, prefix, preset, preset_version, next_seq)
        VALUES ('tasks', 'TASKS', 'tasks', 1, 2);
        INSERT INTO items (id, collection, seq, title, fields, preset_version, state, created_at,
          updated_at, created_by_kind, created_by_name)
        VALUES ('TASKS-1', 'tasks', 1, 'A', '{}', 1, 'todo', 't', 't', 'human', 'ana');
        INSERT INTO evidence (item_id, role, kind, filename, content_type, size, sha256, caption,
          created_at, actor_kind, actor_name, channel)
        VALUES ('TASKS-1', 'single', 'log', 'a.log', 'text/plain', 1, 'abc', NULL, 't', 'agent',
          'bot', 'cli');
      `);
      migrate(db);
    });

    it('records no module for existing evidence: readers fall back to the first that accepts it', () => {
      expect(db.prepare('SELECT id, module FROM evidence').all()).toEqual([
        { id: 1, module: null },
      ]);
    });
  });

  describe('relations', () => {
    const insert = (kind: string, from: string, to: string) =>
      db
        .prepare(
          `INSERT INTO relations (kind, from_id, to_id, created_at, actor_kind, actor_name, channel)
          VALUES (?, ?, ?, 't', 'agent', 'bot', 'cli')`,
        )
        .run(kind, from, to);

    beforeEach(() => {
      migrate(db);
      db.exec(`
        INSERT INTO collections (name, prefix, preset, preset_version, next_seq)
        VALUES ('tasks', 'TASKS', 'tasks', 1, 4);
        INSERT INTO items (id, collection, seq, title, fields, preset_version, state, created_at,
          updated_at, created_by_kind, created_by_name)
        VALUES ('TASKS-1', 'tasks', 1, 'A', '{}', 1, 'todo', 't', 't', 'human', 'ana'),
          ('TASKS-2', 'tasks', 2, 'B', '{}', 1, 'todo', 't', 't', 'human', 'ana'),
          ('TASKS-3', 'tasks', 3, 'C', '{}', 1, 'todo', 't', 't', 'human', 'ana');
      `);
    });

    it('stores one link per kind and pair', () => {
      insert('blocks', 'TASKS-1', 'TASKS-2');

      expect(() => insert('blocks', 'TASKS-1', 'TASKS-2')).toThrow(/UNIQUE/);
      expect(() => insert('relates', 'TASKS-1', 'TASKS-2')).not.toThrow();
    });

    it('gives an item at most one parent', () => {
      insert('parent', 'TASKS-2', 'TASKS-1');

      expect(() => insert('parent', 'TASKS-2', 'TASKS-3')).toThrow(/UNIQUE/);
      expect(() => insert('parent', 'TASKS-3', 'TASKS-1')).not.toThrow();
    });

    it('references existing items', () => {
      expect(() => insert('blocks', 'TASKS-1', 'TASKS-9')).toThrow(/FOREIGN KEY/);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      migrate(db);
      db.exec(`
        INSERT INTO collections (name, prefix, preset, preset_version, next_seq)
        VALUES ('tasks', 'TASKS', 'tasks', 1, 2);
        INSERT INTO items (id, collection, seq, title, fields, preset_version, state, created_at,
          updated_at, created_by_kind, created_by_name)
        VALUES ('TASKS-1', 'tasks', 1, 'A', '{}', 1, 'todo', 't', 't', 'human', 'ana');
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
