import type { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from './migrations.ts';

// What belongs to this computer's one Otea server rather than to a project ($OTEA_HOME/machine.db):
// the paired devices, how a phone reaches the server, who is told when something becomes yours, and
// the local projects the server was asked to serve. The tables of devices, phone and notify_targets
// are laid out as a project's used to be, so the use cases in app/ read them the same way.
const MACHINE_MIGRATIONS = [
  `
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    paired_at TEXT NOT NULL,
    last_seen_at TEXT
  );

  CREATE TABLE phone (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    transport TEXT NOT NULL,
    tailscale_host TEXT,
    lan_open INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE notify_targets (
    id TEXT PRIMARY KEY,
    device TEXT UNIQUE REFERENCES devices (id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE,
    p256dh TEXT,
    auth TEXT,
    lang TEXT NOT NULL,
    prefs TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE local_projects (
    id TEXT PRIMARY KEY,
    root TEXT NOT NULL,
    added_at TEXT NOT NULL
  );
  `,
];

export function migrateMachine(db: DatabaseSync): void {
  applyMigrations(db, MACHINE_MIGRATIONS);
}

// A local project (.otea/ in its folder) the server serves beside the registered ones.
export type LocalProjectRow = { id: string; root: string };

export function upsertLocalProject(db: DatabaseSync, project: LocalProjectRow, at: string): void {
  db.prepare(
    `INSERT INTO local_projects (id, root, added_at) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET root = excluded.root`,
  ).run(project.id, project.root, at);
}

export function selectLocalProjects(db: DatabaseSync): LocalProjectRow[] {
  return db
    .prepare('SELECT id, root FROM local_projects ORDER BY added_at, rowid')
    .all() as LocalProjectRow[];
}

export function deleteLocalProject(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM local_projects WHERE id = ?').run(id);
}
