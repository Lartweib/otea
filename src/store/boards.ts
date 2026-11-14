import type { DatabaseSync } from 'node:sqlite';

// Boards with versions: a board row (its hidden id, the collection its items live in once it is
// published, the live version), its published versions (append-only) and at most one draft. The
// definitions are JSON documents (core/board/schema.ts), written whole.

export type BoardRow = {
  id: string;
  collection: string | null;
  liveVersion: number | null;
  builtin: boolean;
  createdAt: string;
  // When the person archived it (app/board-archive.ts); null while it stands.
  archivedAt: string | null;
};

export type VersionRow = {
  version: number;
  definition: string;
  publishedAt: string;
  publishedBy: string;
};

// `requestItem` is the Pedido an agent drafts the board on; `agentNote`, the JSON list of what the
// agent added, once its draft arrived.
export type DraftRow = {
  boardId: string;
  definition: string;
  baseVersion: number | null;
  updatedAt: string;
  requestItem: string | null;
  agentNote: string | null;
};

type Row = Record<string, unknown>;

function toBoard(row: Row): BoardRow {
  return {
    id: String(row.id),
    collection: row.collection === null ? null : String(row.collection),
    liveVersion: row.live_version === null ? null : Number(row.live_version),
    builtin: Number(row.builtin) === 1,
    createdAt: String(row.created_at),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
  };
}

export function insertBoard(
  db: DatabaseSync,
  board: { id: string; createdAt: string; builtin: boolean },
): void {
  db.prepare('INSERT INTO boards (id, builtin, created_at) VALUES (?, ?, ?)').run(
    board.id,
    board.builtin ? 1 : 0,
    board.createdAt,
  );
}

export function findBoard(db: DatabaseSync, id: string): BoardRow | undefined {
  const row = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
  return row && toBoard(row);
}

export function findBoardOfCollection(db: DatabaseSync, collection: string): BoardRow | undefined {
  const row = db.prepare('SELECT * FROM boards WHERE collection = ?').get(collection);
  return row && toBoard(row);
}

// The boards that stand; `archived` adds the archived ones (what reads their items needs).
export function listBoards(db: DatabaseSync, options: { archived?: boolean } = {}): BoardRow[] {
  const archived = options.archived ? '' : ' AND archived_at IS NULL';
  return db
    .prepare(`SELECT * FROM boards WHERE retired_at IS NULL${archived} ORDER BY created_at, id`)
    .all()
    .map(toBoard);
}

export function setArchived(db: DatabaseSync, id: string, at: string | null): void {
  db.prepare('UPDATE boards SET archived_at = ? WHERE id = ?').run(at, id);
}

// A board that was published once and undone keeps its versions (they are append-only): discarding
// it retires it from every listing instead of deleting it.
export function retireBoard(db: DatabaseSync, id: string, at: string): void {
  db.prepare('UPDATE boards SET retired_at = ? WHERE id = ?').run(at, id);
}

export function deleteBoard(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM boards WHERE id = ?').run(id);
}

export function setLiveVersion(db: DatabaseSync, id: string, version: number | null): void {
  db.prepare('UPDATE boards SET live_version = ? WHERE id = ?').run(version, id);
}

export function setBoardCollection(db: DatabaseSync, id: string, collection: string): void {
  db.prepare('UPDATE boards SET collection = ? WHERE id = ?').run(collection, id);
}

export function insertVersion(db: DatabaseSync, version: VersionRow & { boardId: string }): void {
  db.prepare(
    'INSERT INTO board_versions (board_id, version, definition, published_at, published_by) VALUES (?, ?, ?, ?, ?)',
  ).run(
    version.boardId,
    version.version,
    version.definition,
    version.publishedAt,
    version.publishedBy,
  );
}

function toVersion(row: Row): VersionRow {
  return {
    version: Number(row.version),
    definition: String(row.definition),
    publishedAt: String(row.published_at),
    publishedBy: String(row.published_by),
  };
}

export function findVersion(db: DatabaseSync, id: string, version: number): VersionRow | undefined {
  const row = db
    .prepare('SELECT * FROM board_versions WHERE board_id = ? AND version = ?')
    .get(id, version);
  return row && toVersion(row);
}

export function listVersions(db: DatabaseSync, id: string): VersionRow[] {
  return db
    .prepare('SELECT * FROM board_versions WHERE board_id = ? ORDER BY version')
    .all(id)
    .map(toVersion);
}

export function maxVersion(db: DatabaseSync, id: string): number {
  const row = db.prepare('SELECT max(version) AS v FROM board_versions WHERE board_id = ?').get(id);
  return Number(row?.v ?? 0);
}

export function upsertDraft(db: DatabaseSync, draft: DraftRow): void {
  db.prepare(
    `INSERT INTO board_drafts (board_id, definition, base_version, updated_at, request_item, agent_note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (board_id) DO UPDATE SET definition = excluded.definition,
       base_version = excluded.base_version, updated_at = excluded.updated_at,
       request_item = excluded.request_item, agent_note = excluded.agent_note`,
  ).run(
    draft.boardId,
    draft.definition,
    draft.baseVersion,
    draft.updatedAt,
    draft.requestItem,
    draft.agentNote,
  );
}

export function findDraft(db: DatabaseSync, id: string): DraftRow | undefined {
  const row = db.prepare('SELECT * FROM board_drafts WHERE board_id = ?').get(id);
  if (!row) return undefined;
  return {
    boardId: String(row.board_id),
    definition: String(row.definition),
    baseVersion: row.base_version === null ? null : Number(row.base_version),
    updatedAt: String(row.updated_at),
    requestItem: row.request_item === null ? null : String(row.request_item),
    agentNote: row.agent_note === null ? null : String(row.agent_note),
  };
}

export function deleteDraft(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM board_drafts WHERE board_id = ?').run(id);
}

// A board renamed renames its collection: the collection row, its items and its board row move to
// the new name together (boards follow by ON UPDATE CASCADE). Run inside a transaction.
export function renameCollection(db: DatabaseSync, from: string, to: string): void {
  db.exec('PRAGMA defer_foreign_keys = ON');
  db.prepare('UPDATE collections SET name = ? WHERE name = ?').run(to, from);
  db.prepare('UPDATE items SET collection = ? WHERE collection = ?').run(to, from);
}

// Changes whenever a board is published, restored, added, archived or deleted: a long-lived reader (the MCP server)
// compares it to know when to compile the boards again.
export function boardsStamp(db: DatabaseSync): string {
  const row = db
    .prepare(
      "SELECT count(*) AS n, coalesce(group_concat(id || ':' || coalesce(live_version, 0) || ':' || coalesce(collection, '') || ':' || coalesce(archived_at, ''), ','), '') AS s FROM (SELECT * FROM boards ORDER BY id)",
    )
    .get();
  return `${row?.n ?? 0}|${row?.s ?? ''}`;
}
