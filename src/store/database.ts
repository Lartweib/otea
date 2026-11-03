import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // The timeout goes first: switching to WAL needs a lock, and another process may hold it.
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function dataVersion(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA data_version').get()?.data_version);
}

// A consistent copy of the whole database in a new file, taken without blocking other connections.
export function vacuumInto(db: DatabaseSync, path: string): void {
  db.prepare('VACUUM INTO ?').run(path);
}

export function integrityCheck(db: DatabaseSync): string {
  const rows = db.prepare('PRAGMA integrity_check').all();
  return rows.map((row) => String(row.integrity_check)).join(' ');
}

export type TableSummary = Record<string, { rows: number; lastRowid: number }>;

// Per table, its row count and highest rowid: two copies that agree hold the same rows, unless a
// row was changed in place.
export function tableSummary(db: DatabaseSync): TableSummary {
  const sql = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'";
  const names = db
    .prepare(sql)
    .all()
    .map((row) => String(row.name));
  return Object.fromEntries(
    names.sort().map((name) => {
      const row = db.prepare(`SELECT count(*) AS n, max(rowid) AS last FROM "${name}"`).get();
      return [name, { rows: Number(row?.n ?? 0), lastRowid: Number(row?.last ?? 0) }];
    }),
  );
}
