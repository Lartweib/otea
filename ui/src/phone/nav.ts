import { useSyncExternalStore } from 'react';

// Whether the phone's nav sheet is open. The topbar's panel button (`.navbtn`, the shell's markup)
// opens it: NavSheet listens for presses on that class, so the shell needs no import from here
// (it may still call navSheet.open()).
export type NavSheetStore = {
  get(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  subscribe(fn: () => void): () => void;
};

export function makeNavSheet(): NavSheetStore {
  let open = false;
  const listeners = new Set<() => void>();
  const set = (v: boolean) => {
    if (v === open) return;
    open = v;
    for (const fn of [...listeners]) fn();
  };
  return {
    get: () => open,
    open: () => set(true),
    close: () => set(false),
    toggle: () => set(!open),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const navSheet: NavSheetStore = makeNavSheet();

export function useNavSheet(): boolean {
  return useSyncExternalStore(navSheet.subscribe, navSheet.get, navSheet.get);
}
