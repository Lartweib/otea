import { useSyncExternalStore } from 'react';

// What the shell has open that someone else may open too: the phone's nav sheet (its button is in
// the topbar, the sheet is the phone slice's NavSheet) and Preferences (its button is at the
// rail's foot; on a phone the nav sheet's foot opens it). Nothing here is remembered.
export type ShellUi = { nav: boolean; prefs: boolean };

export type ShellUiStore = {
  get(): ShellUi;
  set(p: Partial<ShellUi>): void;
  subscribe(fn: () => void): () => void;
};

export function makeShellUi(): ShellUiStore {
  let state: ShellUi = { nav: false, prefs: false };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(p) {
      const keys = Object.keys(p) as (keyof ShellUi)[];
      if (keys.every((k) => state[k] === p[k])) return;
      state = { ...state, ...p };
      for (const fn of [...listeners]) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const shellUi: ShellUiStore = makeShellUi();

export function useShellUi(): ShellUi {
  return useSyncExternalStore(shellUi.subscribe, shellUi.get, shellUi.get);
}
