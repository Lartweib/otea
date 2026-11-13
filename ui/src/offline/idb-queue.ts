import type { QueuedCapture, QueueStore } from './capture-queue.ts';

// The capture queue in IndexedDB, shared by the page and the service worker (one database per
// origin). A thin wrapper: what it keeps and when is capture-queue.ts's.

const DB = 'otea-offline';
const STORE = 'captures';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = act(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export const idbQueue: QueueStore = {
  all: () => run('readonly', (store) => store.getAll() as IDBRequest<QueuedCapture[]>),
  put: async (capture) => {
    await run('readwrite', (store) => store.put(capture));
  },
  remove: async (id) => {
    await run('readwrite', (store) => store.delete(id));
  },
};

export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}
