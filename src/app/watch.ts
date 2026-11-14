import type { DatabaseSync } from 'node:sqlite';
import { dataVersion } from '../store/database.ts';

export const POLL_INTERVAL_MS = 250;

export type WatchOptions = {
  signal: AbortSignal;
  intervalMs?: number;
  // Checks again this often even without a commit, for changes no write announces (lease expiry).
  recheckMs?: number;
  timeoutMs?: number;
  // Runs `run` this often while it waits: a waiting agent says it is still there (otea wait).
  beat?: { everyMs: number; run: () => void };
};

export type Watched<T> = { found: T } | { stopped: 'aborted' | 'timeout' };

// Resolves true after `ms`, false at once when the signal aborts. On the global timers, so a test
// can run a long wait on fake time.
function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const aborted = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

// Runs `check` now and again whenever another connection or process commits, by polling the
// database's data_version, until it returns a value, the signal aborts or the timeout passes.
export async function watch<T>(
  db: DatabaseSync,
  check: () => T | undefined,
  options: WatchOptions,
): Promise<Watched<T>> {
  const { signal, intervalMs = POLL_INTERVAL_MS, recheckMs = Infinity, beat } = options;
  const deadline = Date.now() + (options.timeoutMs ?? Infinity);
  // Read before checking, so a commit landing during the check is seen on the next tick.
  let version = dataVersion(db);
  let checkedAt = Date.now();
  let beatAt = checkedAt;
  let found = check();
  while (found === undefined) {
    const left = deadline - Date.now();
    if (left <= 0) return { stopped: 'timeout' };
    if (!(await pause(Math.min(intervalMs, left), signal))) return { stopped: 'aborted' };
    if (beat && Date.now() - beatAt >= beat.everyMs) {
      beatAt = Date.now();
      beat.run();
    }
    const current = dataVersion(db);
    if (current === version && Date.now() - checkedAt < recheckMs) continue;
    version = current;
    checkedAt = Date.now();
    found = check();
  }
  return { found };
}
