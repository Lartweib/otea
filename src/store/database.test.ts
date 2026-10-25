import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.ts';

const pragma = (db: ReturnType<typeof openDatabase>, name: string) =>
  Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0];

describe('openDatabase', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('applies WAL, busy timeout and foreign keys on a file database', () => {
    const path = join(tmpdir(), `otea-test-${randomUUID()}.db`);
    const db = openDatabase(path);
    cleanups.push(() => {
      db.close();
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    });

    expect(pragma(db, 'journal_mode')).toBe('wal');
    expect(pragma(db, 'busy_timeout')).toBe(5000);
    expect(pragma(db, 'foreign_keys')).toBe(1);
  });

  it('opens an in-memory database', () => {
    const db = openDatabase(':memory:');
    cleanups.push(() => db.close());

    expect(db.isOpen).toBe(true);
    expect(pragma(db, 'foreign_keys')).toBe(1);
  });
});
