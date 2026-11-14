import { flush, sendWith } from './capture-queue.ts';
import { idbQueue } from './idb-queue.ts';
import { SYNC_TAG } from './register.ts';
import { clickTarget, openFromClick, pushNotification, type WindowLike } from './sw-push.ts';
import { SHELL_KEY, swRoute } from './sw-routes.ts';
import {
  type CacheLike,
  cacheFirst,
  DATA_CACHE,
  networkFirst,
  shellCache,
  staleCaches,
} from './sw-strategies.ts';

// The installed app's service worker, built on its own into /sw.js (sw-build.ts puts the version
// and the files to keep in place of these two). Registered over HTTPS only (register.ts).

declare const __OTEA_VERSION__: string;
declare const __OTEA_PRECACHE__: string[];

// The few service-worker calls this file makes: the DOM's types do not describe a worker's scope.
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & { request: Request; respondWith(r: Promise<Response>): void };
type SyncEvent = ExtendableEvent & { tag: string };
type MessageEvt = ExtendableEvent & {
  data: unknown;
  source: { postMessage(message: unknown): void } | null;
};
type PushEvt = ExtendableEvent & { data: { json(): unknown } | null };
type ClickEvt = ExtendableEvent & { notification: { data: unknown; close(): void } };
type Scope = {
  location: Location;
  skipWaiting(): Promise<void>;
  registration: {
    showNotification(title: string, options: NotificationOptions): Promise<void>;
  };
  clients: {
    claim(): Promise<void>;
    matchAll(options?: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
  addEventListener(type: 'sync', fn: (e: SyncEvent) => void): void;
  addEventListener(type: 'message', fn: (e: MessageEvt) => void): void;
  addEventListener(type: 'push', fn: (e: PushEvt) => void): void;
  addEventListener(type: 'notificationclick', fn: (e: ClickEvt) => void): void;
};

const sw = self as unknown as Scope;
const VERSION = __OTEA_VERSION__;
const PRECACHE = __OTEA_PRECACHE__;
const PRECACHED = new Set(PRECACHE);
const origin = sw.location.origin;

const opened = (name: string): Promise<CacheLike> =>
  caches.open(name).then((cache) => ({
    match: (key) => cache.match(key),
    put: (key, response) => cache.put(key, response),
  }));

const net = (request: Request | string) => fetch(request);

// A new version fills its own cache, then waits: it takes over when the page asks (register.ts).
sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(shellCache(VERSION)).then((cache) => cache.addAll(PRECACHE)));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(staleCaches(names, VERSION).map((name) => caches.delete(name))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('message', (event) => {
  const type = (event.data as { type?: unknown } | null)?.type;
  if (type === 'skip-waiting') event.waitUntil(sw.skipWaiting());
  if (type === 'version') event.source?.postMessage({ type: 'version', version: VERSION });
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const route = swRoute(request, origin, PRECACHED);
  if (route === 'network') return;
  if (route === 'data') {
    event.respondWith(
      opened(DATA_CACHE).then((cache) => networkFirst(request, { net, cache, now: Date.now })),
    );
    return;
  }
  const key = route === 'shell' ? SHELL_KEY : new URL(request.url).pathname;
  event.respondWith(
    opened(shellCache(VERSION)).then((cache) =>
      cacheFirst(key, route === 'shell' ? SHELL_KEY : request, { net, cache }),
    ),
  );
});

// Android: the captures queued offline go as soon as the network is back, even with the app shut.
sw.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    flush(idbQueue, sendWith(fetch.bind(self))).then(async (out) => {
      for (const client of await sw.clients.matchAll())
        client.postMessage({ type: 'queue-changed' });
      // Still unheard: rejecting asks the browser to try the sync again later.
      if (out.unheard) throw new Error('PC not reachable');
    }),
  );
});

// A notice from the PC (Preferencias › Avisos): always shown, as browsers require of a push.
sw.addEventListener('push', (event) => {
  let payload: unknown;
  try {
    payload = event.data?.json();
  } catch {
    payload = undefined;
  }
  const { title, options } = pushNotification(payload);
  event.waitUntil(sw.registration.showNotification(title, options));
});

// A tap opens the app on the item it is about (or Te toca, for a burst).
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = clickTarget(event.notification.data, origin);
  event.waitUntil(
    openFromClick(target, {
      matchAll: () => sw.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      openWindow: (url) => sw.clients.openWindow(url),
    }),
  );
});
