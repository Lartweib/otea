import { useSyncExternalStore } from 'react';
import {
  type Flushed,
  fits,
  flush,
  type QueuedCapture,
  type QueueStore,
  sendWith,
  serialFlush,
} from './capture-queue.ts';
import { hasIndexedDb, idbQueue } from './idb-queue.ts';
import { askBackgroundSync, here, offlineCapable } from './register.ts';

// The page's side of the capture queue (capture-queue.ts): what waits, for Te toca and the capture
// sheet to show as "en cola", and when it is sent. iOS has no Background Sync, so the page sends
// it as it opens, comes back to the front, goes online, and as the live stream reconnects.

export type QueueView = { captures: QueuedCapture[] };

let view: QueueView = { captures: [] };
const listeners = new Set<() => void>();
let store: QueueStore = idbQueue;
let onFlushed: (out: Flushed) => void = () => undefined;

function set(next: QueueView) {
  view = next;
  for (const fn of [...listeners]) fn();
}

// Only where the app can open without the PC: elsewhere a capture is sent or refused there and then.
export function queueAvailable(): boolean {
  return offlineCapable(here()) && hasIndexedDb();
}

async function reload(): Promise<void> {
  try {
    set({ captures: (await store.all()).sort((a, b) => a.at - b.at) });
  } catch {
    // Storage blocked: nothing shows as queued, and nothing could have been queued either.
  }
}

const flushOnce = serialFlush(async () => {
  const out = await flush(store, sendWith(fetch.bind(globalThis)));
  await reload();
  if (out.made.length > 0 || out.refused.length > 0) onFlushed(out);
  return out;
});

export function flushQueue(): Promise<Flushed> | undefined {
  if (!queueAvailable() || view.captures.every((c) => c.refused !== undefined)) return undefined;
  return flushOnce();
}

export type Queued = { ok: true } | { ok: false; reason: 'full' | 'storage' };

export async function enqueue(capture: QueuedCapture): Promise<Queued> {
  try {
    if (!fits(await store.all(), capture)) return { ok: false, reason: 'full' };
    await store.put(capture);
  } catch {
    return { ok: false, reason: 'storage' };
  }
  await reload();
  void askBackgroundSync();
  return { ok: true };
}

export async function discard(id: string): Promise<void> {
  await store.remove(id).catch(() => undefined);
  await reload();
}

// Starts watching for the moments to send: once, as the app starts. `flushed` hears what went.
export function startQueue(flushed: (out: Flushed) => void): void {
  onFlushed = flushed;
  if (!queueAvailable()) return;
  const send = () => {
    void reload().then(() => flushQueue());
  };
  send();
  window.addEventListener('online', send);
  window.addEventListener('focus', send);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') send();
  });
  // The service worker sent some from the background (Android): read the queue again.
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    if ((event.data as { type?: unknown } | null)?.type === 'queue-changed') void reload();
  });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => view;

export function useQueue(): QueueView {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// For tests: another store, and an empty view.
export function setQueueStoreForTests(other: QueueStore): void {
  store = other;
  view = { captures: [] };
}
