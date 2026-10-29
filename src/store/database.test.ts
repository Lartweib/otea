import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataVersion, openDatabase, transaction } from './database.ts';

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

  it('waits for another process holding the lock instead of failing while it opens', async () => {
    const path = join(tmpdir(), `otea-test-${randomUUID()}.db`);
    const holder = spawn(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        '-e',
        `const db = new (require('node:sqlite').DatabaseSync)(${JSON.stringify(path)});
         db.exec('BEGIN EXCLUSIVE'); console.log('locked');
         setTimeout(() => { db.exec('COMMIT'); db.close(); }, 500);`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await once(holder.stdout, 'data');
    cleanups.push(() => {
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    });

    const db = openDatabase(path);
    cleanups.unshift(() => db.close());
    await once(holder, 'exit');

    expect(pragma(db, 'journal_mode')).toBe('wal');
  });

  it('opens an in-memory database', () => {
    const db = openDatabase(':memory:');
    cleanups.push(() => db.close());

    expect(db.isOpen).toBe(true);
    expect(pragma(db, 'foreign_keys')).toBe(1);
  });
});

describe('transaction', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE notes (text TEXT)');
    return db;
  };
  const count = (db: ReturnType<typeof openDatabase>) =>
    db.prepare('SELECT count(*) AS n FROM notes').get()?.n;

  it('commits and returns the result', () => {
    const db = setup();

    const result = transaction(db, () => {
      db.exec("INSERT INTO notes VALUES ('a')");
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(count(db)).toBe(1);
    expect(db.isTransaction).toBe(false);
    db.close();
  });

  it('rolls back and rethrows on error', () => {
    const db = setup();
    const failing = () =>
      transaction(db, () => {
        db.exec("INSERT INTO notes VALUES ('a')");
        throw new Error('boom');
      });

    expect(failing).toThrow('boom');
    expect(count(db)).toBe(0);
    expect(db.isTransaction).toBe(false);
    db.close();
  });
});

describe('dataVersion', () => {
  it('changes after another connection commits, not after own commits', () => {
    const path = join(tmpdir(), `otea-test-${randomUUID()}.db`);
    const own = openDatabase(path);
    const other = openDatabase(path);
    own.exec('CREATE TABLE notes (text TEXT)');
    const initial = dataVersion(own);

    own.exec("INSERT INTO notes VALUES ('own')");
    const afterOwn = dataVersion(own);
    other.exec("INSERT INTO notes VALUES ('other')");
    const afterOther = dataVersion(own);

    own.close();
    other.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    expect(afterOwn).toBe(initial);
    expect(afterOther).not.toBe(initial);
  });
});
