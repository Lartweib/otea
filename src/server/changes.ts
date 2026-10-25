import type { DatabaseSync } from 'node:sqlite';
import { dataVersion } from '../store/database.ts';

export type Listener = () => void;

export type ChangeFeed = {
  subscribe(listener: Listener): () => void;
  close(): void;
};

export function createChangeFeed(db: DatabaseSync, intervalMs = 250): ChangeFeed {
  const listeners = new Set<Listener>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let version = 0;

  const poll = () => {
    const current = dataVersion(db);
    if (current === version) return;
    version = current;
    for (const listener of listeners) listener();
  };

  const start = () => {
    version = dataVersion(db);
    timer = setInterval(poll, intervalMs);
  };

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!timer) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    close() {
      listeners.clear();
      stop();
    },
  };
}
