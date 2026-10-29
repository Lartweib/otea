import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { dataVersion } from '../store/database.ts';

export const POLL_INTERVAL_MS = 250;

export type WatchOptions = {
  signal: AbortSignal;
  intervalMs?: number;
  // Checks again this often even without a commit, for changes no write announces (lease expiry).
  recheckMs?: number;
  timeoutMs?: number;
};

export type Watched<T> = { found: T } | { stopped: 'aborted' | 'timeout' };

async function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await delay(ms, undefined, { signal });
    return true;
  } catch (error) {
    if (signal.aborted) return false;
    throw error;
  }
}

// Runs `check` now and again whenever another connection or process commits, by polling the
// database's data_version, until it returns a value, the signal aborts or the timeout passes.
export async function watch<T>(
  db: DatabaseSync,
  check: () => T | undefined,
  options: WatchOptions,
): Promise<Watched<T>> {
  const { signal, intervalMs = POLL_INTERVAL_MS, recheckMs = Infinity } = options;
  const deadline = Date.now() + (options.timeoutMs ?? Infinity);
  // Read before checking, so a commit landing during the check is seen on the next tick.
  let version = dataVersion(db);
  let checkedAt = Date.now();
  let found = check();
  while (found === undefined) {
    const left = deadline - Date.now();
    if (left <= 0) return { stopped: 'timeout' };
    if (!(await pause(Math.min(intervalMs, left), signal))) return { stopped: 'aborted' };
    const current = dataVersion(db);
    if (current === version && Date.now() - checkedAt < recheckMs) continue;
    version = current;
    checkedAt = Date.now();
    found = check();
  }
  return { found };
}
