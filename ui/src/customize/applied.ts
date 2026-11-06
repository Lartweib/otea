import { useSyncExternalStore } from 'react';

// The note left behind when a view is applied: the builder is gone by then, so the app shows it.
export type Applied = { text: string; undo?: () => Promise<unknown>; at: number };

let current: Applied | undefined;
const listeners = new Set<() => void>();

export function announce(text: string, undo?: () => Promise<unknown>): void {
  current = { text, ...(undo ? { undo } : {}), at: Date.now() };
  for (const listener of listeners) listener();
}

export function dismiss(): void {
  current = undefined;
  for (const listener of listeners) listener();
}

export function useApplied(): Applied | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
