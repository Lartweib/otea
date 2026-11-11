import { useSyncExternalStore } from 'react';
import { t } from '../i18n/i18n.ts';
import type { ToastOptions } from '../kit/pop/toast.tsx';

// The note left behind when a view is applied: the builder is gone by then, so the page it lands
// on shows it. The app shows it as its toast; a Customize page, which has no toast of the app's,
// claims it and shows it in its own note column.
export type Applied = { text: string; undo?: () => Promise<unknown>; at: number };

let now: Applied | undefined;
let claims = 0;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

export function announce(text: string, undo?: () => Promise<unknown>): void {
  now = { text, ...(undo ? { undo } : {}), at: Date.now() };
  tell();
}

export function dismiss(): void {
  now = undefined;
  tell();
}

export const current = (): Applied | undefined => now;

// A page that shows the note itself; the app's toast leaves it alone while one is claimed.
export function claimApplied(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}
export const isClaimed = (): boolean => claims > 0;

export function useApplied(): Applied | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => now,
  );
}

// The note as a toast: Deshacer takes the change back, tells the app to read again, and says so.
export function appliedToast(applied: Applied, onUndone: () => void): ToastOptions {
  const undo = applied.undo;
  return {
    msg: applied.text,
    ...(undo
      ? {
          undo: () => {
            undo().then(
              () => {
                onUndone();
                announce(t('cz.undone'));
              },
              () => announce(t('cz.failed')),
            );
          },
        }
      : {}),
  };
}
