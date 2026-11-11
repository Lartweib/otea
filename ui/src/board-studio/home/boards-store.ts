import { useEffect, useSyncExternalStore } from 'react';
import { type BoardSummary, fetchBoards } from '../api.ts';

// The project's boards (GET /api/boards), shared by Studio's home, the rail, a board's page and
// an item's sheet: one request per change of the project, whoever asks. A refresh that fails while
// a list is shown keeps it; a first load that fails says why, and reload() tries again.

export type BoardsState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; boards: BoardSummary[] };

let state: BoardsState = { status: 'loading' };
let loadedFor = Number.NEGATIVE_INFINITY;
let asked = Number.NEGATIVE_INFINITY;
let seq = 0;
const listeners = new Set<() => void>();

function set(next: BoardsState) {
  state = next;
  for (const fn of listeners) fn();
}

// Reads the boards again for this version of the project, unless it was read for it already.
export function loadBoards(version: number, force = false): void {
  if (!force && (loadedFor >= version || asked >= version)) return;
  asked = Math.max(asked, version);
  const mine = ++seq;
  if (force && state.status === 'failed') set({ status: 'loading' });
  fetchBoards().then(
    (boards) => {
      if (mine !== seq) return;
      loadedFor = Math.max(loadedFor, version);
      set({ status: 'ready', boards });
    },
    (error: unknown) => {
      if (mine !== seq) return;
      asked = loadedFor;
      if (state.status !== 'ready')
        set({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    },
  );
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// The boards, read again on each new version of the project (the change feed).
export function useBoards(version: number): BoardsState {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  useEffect(() => loadBoards(version), [version]);
  return current;
}

export const boardsOf = (s: BoardsState): BoardSummary[] => (s.status === 'ready' ? s.boards : []);

// The board a collection is the published form of.
export function boardOfCollection(
  boards: readonly BoardSummary[],
  collection: string,
): BoardSummary | undefined {
  return boards.find((b) => b.collection === collection);
}

// What the store holds now.
export const boardsState = (): BoardsState => state;

// For tests: forget what was read.
export function resetBoards(): void {
  state = { status: 'loading' };
  loadedFor = Number.NEGATIVE_INFINITY;
  asked = Number.NEGATIVE_INFINITY;
  seq++;
}
