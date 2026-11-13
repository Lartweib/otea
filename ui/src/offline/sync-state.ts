import { useSyncExternalStore } from 'react';
import { FROM_CACHE, SAVED_AT } from './sw-routes.ts';

// Whether what the app shows came from the PC just now or is the last it saw: every read the app
// makes tells this store (api.ts). A read the service worker answered from its cache, or one that
// got no answer at all, means the PC does not answer; the next read from the PC means it does.

export type SyncState = {
  offline: boolean;
  // When the app last heard from the PC (ms since the epoch); null before it ever has.
  syncedAt: number | null;
};

export type Read =
  | { kind: 'fresh' }
  | { kind: 'cached'; savedAt: number | null }
  | { kind: 'failed' };

export function afterRead(state: SyncState, read: Read, now: number): SyncState {
  if (read.kind === 'fresh') return { offline: false, syncedAt: now };
  const saved = read.kind === 'cached' ? read.savedAt : null;
  const syncedAt =
    saved === null ? state.syncedAt : Math.max(saved, state.syncedAt ?? Number.NEGATIVE_INFINITY);
  return { offline: true, syncedAt };
}

export function readOf(headers: Pick<Headers, 'get'>): Read {
  if (headers.get(FROM_CACHE) === null) return { kind: 'fresh' };
  const saved = Number(headers.get(SAVED_AT));
  return { kind: 'cached', savedAt: Number.isFinite(saved) && saved > 0 ? saved : null };
}

let state: SyncState = { offline: false, syncedAt: null };
const listeners = new Set<() => void>();

function set(next: SyncState) {
  if (next.offline === state.offline && next.syncedAt === state.syncedAt) return;
  state = next;
  for (const fn of [...listeners]) fn();
}

export function noteRead(read: Read, now = Date.now()): void {
  set(afterRead(state, read, now));
}

export const syncNow = (): SyncState => state;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, syncNow, syncNow);
}

// For tests: back to a fresh start.
export function resetSync(): void {
  state = { offline: false, syncedAt: null };
}
