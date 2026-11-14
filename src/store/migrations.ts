import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './database.ts';

export const MIGRATIONS = [
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
  `
  ALTER TABLE collections ADD COLUMN preset TEXT NOT NULL DEFAULT 'tasks';
  ALTER TABLE collections ADD COLUMN preset_version INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE collections DROP COLUMN workflow;

  ALTER TABLE items ADD COLUMN fields TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE items ADD COLUMN preset_version INTEGER NOT NULL DEFAULT 1;
  UPDATE items SET fields = json_object('description', body) WHERE body <> '';
  ALTER TABLE items DROP COLUMN body;
  `,
  `
  ALTER TABLE items ADD COLUMN lease_holder TEXT;
  ALTER TABLE items ADD COLUMN lease_expires_at TEXT;
  `,
  `
  CREATE TABLE evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL REFERENCES items (id),
    role TEXT NOT NULL,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    caption TEXT,
    created_at TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    channel TEXT NOT NULL
  );

  CREATE INDEX evidence_item_id ON evidence (item_id);

  CREATE TRIGGER evidence_no_update BEFORE UPDATE ON evidence
  BEGIN SELECT RAISE(ABORT, 'evidence is append-only'); END;

  CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence
  BEGIN SELECT RAISE(ABORT, 'evidence is append-only'); END;
  `,
  // 'item' is the type of every item of a preset that declares no types (DEFAULT_TYPE in core).
  `
  ALTER TABLE items ADD COLUMN type TEXT NOT NULL DEFAULT 'item';
  `,
  // The id of the layout module evidence was attached to; NULL for evidence attached before modules.
  `
  ALTER TABLE evidence ADD COLUMN module TEXT;
  `,
  // Typed links between items: the current ones, one per kind and pair (a symmetric kind stores its
  // ids in order). Their history is the relation_added and relation_removed events.
  `
  CREATE TABLE relations (
    kind TEXT NOT NULL,
    from_id TEXT NOT NULL REFERENCES items (id),
    to_id TEXT NOT NULL REFERENCES items (id),
    created_at TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    channel TEXT NOT NULL,
    PRIMARY KEY (kind, from_id, to_id)
  );

  CREATE INDEX relations_to_id ON relations (to_id);

  CREATE UNIQUE INDEX relations_one_parent ON relations (from_id) WHERE kind = 'parent';
  `,
  // The project's own identity, one row, so a registry of projects can be rebuilt from their
  // databases. The row is written when the project is opened (it needs a random id).
  `
  CREATE TABLE project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  `,
  // The agents seen at work: the harness they last came through (an MCP client's clientInfo, or
  // `cli`) and when. Agents that wrote before presence was kept start from their last event.
  `
  CREATE TABLE agents (
    name TEXT PRIMARY KEY,
    harness TEXT,
    harness_version TEXT,
    last_seen TEXT NOT NULL
  );

  INSERT INTO agents (name, last_seen)
  SELECT actor_name, max(at) FROM events WHERE actor_kind = 'agent' GROUP BY actor_name;
  `,
  // The icons given to a collection (over its preset's) and to the project; NULL when none was.
  `
  ALTER TABLE collections ADD COLUMN icon TEXT;
  ALTER TABLE project ADD COLUMN icon TEXT;
  `,
  // Devices paired over the LAN (otea serve --lan). Only the SHA-256 of each device token is kept,
  // so the database never holds a token that opens the UI.
  `
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    paired_at TEXT NOT NULL,
    last_seen_at TEXT
  );
  `,
  // Boards with versions (Studio): a hidden id under each board, its published versions as whole
  // JSON definitions (append-only), the live one and at most one draft. A board's items live in
  // `collection` once it is first published; a rename renames the collection and cascades here.
  `
  CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    collection TEXT UNIQUE REFERENCES collections (name) ON UPDATE CASCADE,
    live_version INTEGER,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    -- Set when a board that is not live is discarded but keeps versions it cannot lose.
    retired_at TEXT
  );

  CREATE TABLE board_versions (
    board_id TEXT NOT NULL REFERENCES boards (id),
    version INTEGER NOT NULL,
    definition TEXT NOT NULL,
    published_at TEXT NOT NULL,
    published_by TEXT NOT NULL,
    PRIMARY KEY (board_id, version)
  );

  CREATE TRIGGER board_versions_no_update BEFORE UPDATE ON board_versions
  BEGIN SELECT RAISE(ABORT, 'board versions are append-only'); END;

  CREATE TRIGGER board_versions_no_delete BEFORE DELETE ON board_versions
  BEGIN SELECT RAISE(ABORT, 'board versions are append-only'); END;

  CREATE TABLE board_drafts (
    board_id TEXT PRIMARY KEY REFERENCES boards (id) ON DELETE CASCADE,
    definition TEXT NOT NULL,
    base_version INTEGER,
    updated_at TEXT NOT NULL,
    request_item TEXT REFERENCES items (id),
    agent_note TEXT
  );
  `,
  // The project's repos: the name its items give each one (a repo task's `repo` field) and what
  // identifies it wherever it is cloned (its origin URL, or its root commit; core/repo.ts). The
  // repos already at a project's folders are read in once, the first time they are needed, since
  // that takes git (`repos_read`).
  `
  CREATE TABLE repos (
    name TEXT PRIMARY KEY,
    identity TEXT NOT NULL UNIQUE
  );

  ALTER TABLE project ADD COLUMN repos_read INTEGER NOT NULL DEFAULT 0;
  `,
  // The item `otea next` last offered each agent, in the state it was offered in and when: for a
  // while no other agent is offered it, so two agents asking at once never get the same item.
  `
  CREATE TABLE offers (
    agent TEXT PRIMARY KEY,
    item TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    at TEXT NOT NULL
  );
  `,
  // The profile each agent declares (otea profile): its harness, model and effort as JSON, and
  // whether it was declared in the agent's current session. Every event an agent writes keeps the
  // profile it had then; every change is kept in agent_profiles, append-only.
  `
  ALTER TABLE agents ADD COLUMN profile TEXT;
  ALTER TABLE agents ADD COLUMN profile_confirmed INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE events ADD COLUMN profile TEXT;

  CREATE TABLE agent_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    profile TEXT NOT NULL,
    at TEXT NOT NULL,
    channel TEXT NOT NULL
  );

  CREATE INDEX agent_profiles_agent ON agent_profiles (agent);

  CREATE TRIGGER agent_profiles_no_update BEFORE UPDATE ON agent_profiles
  BEGIN SELECT RAISE(ABORT, 'profile changes are append-only'); END;

  CREATE TRIGGER agent_profiles_no_delete BEFORE DELETE ON agent_profiles
  BEGIN SELECT RAISE(ABORT, 'profile changes are append-only'); END;
  `,
  // A step names no agent any more: any agent does it, and any agent but the one that did it
  // reviews it. The person's review a board kept apart when its named reviewer had done the work
  // itself (`<step>__yours`) is the step's review now (`<step>__review`).
  `
  UPDATE items SET state = substr(state, 1, length(state) - length('__yours')) || '__review'
  WHERE substr(state, -length('__yours')) = '__yours';
  `,
  // How a phone reaches the desk (see app/phone.ts): one row once a transport is chosen; none means
  // the local network. Tailscale keeps the name a phone opens, `<machine>.<tailnet>.ts.net`.
  `
  CREATE TABLE phone (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    transport TEXT NOT NULL,
    tailscale_host TEXT
  );
  `,
  // When an agent connected: its first sighting, a new session, or a sighting after it was away.
  `
  ALTER TABLE agents ADD COLUMN connected_at TEXT;
  `,
  // The key a client sends with a create (Idempotency-Key): a phone that captured offline sends it
  // again until it hears back, and the same key answers with the item it made instead of a second.
  `
  CREATE TABLE client_keys (
    key TEXT PRIMARY KEY,
    item TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    at TEXT NOT NULL
  );
  `,
  // Who is told when something becomes yours (app/notify-targets.ts): a paired device's Web Push
  // subscription, dropped with the device, or the desktop app (id 'desktop', no subscription). Each
  // keeps the kinds it wants, its quiet hours and the language its notices are written in.
  `
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
  `,
  // Whether the local network is open to phones (Settings › Phone, otea phone lan --open): every
  // otea serve starts with it open until it is closed again.
  `
  ALTER TABLE phone ADD COLUMN lan_open INTEGER NOT NULL DEFAULT 0;
  `,
];

function userVersion(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
}

// Runs the migrations a database has not run yet, up to `target`; user_version counts the ones done.
export function applyMigrations(
  db: DatabaseSync,
  migrations: readonly string[],
  target = migrations.length,
): void {
  const current = userVersion(db);
  for (const [offset, sql] of migrations.slice(current, target).entries()) {
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + offset + 1}`);
    });
  }
}

export function migrate(db: DatabaseSync, target = MIGRATIONS.length): void {
  applyMigrations(db, MIGRATIONS, target);
}
