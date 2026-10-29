import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../store/database.ts';
import { watch } from './watch.ts';

describe('watch', () => {
  const path = join(tmpdir(), `otea-test-${randomUUID()}.db`);
  let own: DatabaseSync;
  let other: DatabaseSync;
  let checks: number;

  const notes = () => Number(own.prepare('SELECT count(*) AS n FROM notes').get()?.n);
  const firstNote = () => {
    checks += 1;
    return notes() > 0 ? 'found' : undefined;
  };
  const never = () => {
    checks += 1;
    return undefined;
  };
  const signal = new AbortController().signal;

  beforeEach(() => {
    own = openDatabase(path);
    other = openDatabase(path);
    own.exec('CREATE TABLE notes (text TEXT)');
    checks = 0;
  });

  afterEach(() => {
    own.close();
    other.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
  });

  it('returns at once what the first check finds', async () => {
    own.exec("INSERT INTO notes VALUES ('a')");

    expect(await watch(own, firstNote, { signal })).toEqual({ found: 'found' });
    expect(checks).toBe(1);
  });

  it('checks again when another connection commits', async () => {
    const watching = watch(own, firstNote, { signal, intervalMs: 10 });
    await delay(50);
    other.exec("INSERT INTO notes VALUES ('a')");

    expect(await watching).toEqual({ found: 'found' });
    expect(checks).toBe(2);
  });

  it('does not check again while nothing commits', async () => {
    const result = await watch(own, never, { signal, intervalMs: 10, timeoutMs: 100 });

    expect(result).toEqual({ stopped: 'timeout' });
    expect(checks).toBe(1);
  });

  it('checks again every recheckMs even without a commit', async () => {
    await watch(own, never, { signal, intervalMs: 10, recheckMs: 30, timeoutMs: 200 });

    expect(checks).toBeGreaterThan(2);
  });

  it('stops when the signal aborts', async () => {
    const controller = new AbortController();
    const watching = watch(own, never, { signal: controller.signal, intervalMs: 10 });
    await delay(30);
    controller.abort();

    expect(await watching).toEqual({ stopped: 'aborted' });
  });
});
