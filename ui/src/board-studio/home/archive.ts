import { useSyncExternalStore } from 'react';
import type { ArchivedBoard } from '../api.ts';

// Studio's Archivados (src/app/board-archive.ts): the search over the archived boards and their
// items, and which of the Archivar / Eliminar dialogs is open, wherever it was asked from (the
// editor's board menu, an archived board's row); StudioDialogs renders them once.

export type ArchivedMatch = { board: ArchivedBoard; entries: ArchivedBoard['entries'] };

// Lower case, without accents: "Pantáno" finds "pantano".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim();

// Every board with all its items when nothing is searched; else the items whose id or title has
// the text, and a board whose name has it with all of its items.
export function archivedMatches(boards: readonly ArchivedBoard[], query: string): ArchivedMatch[] {
  const q = fold(query);
  if (q === '') return boards.map((board) => ({ board, entries: board.entries }));
  return boards.flatMap((board) => {
    if (fold(board.name).includes(q)) return [{ board, entries: board.entries }];
    const entries = board.entries.filter(
      ({ id, title }) => fold(id).includes(q) || fold(title).includes(q),
    );
    return entries.length ? [{ board, entries }] : [];
  });
}

// The name the person types to delete a board with its items: as the server checks it.
export const nameTyped = (name: string, typed: string): boolean =>
  typed.trim() !== '' && fold(typed) === fold(name);

export type ArchiveDialog =
  | { kind: 'archive'; board: string; n: number }
  | { kind: 'delete'; board: string; n: number }
  | null;

let open: ArchiveDialog = null;
let n = 0;
const listeners = new Set<() => void>();
const set = (next: ArchiveDialog) => {
  open = next;
  for (const fn of listeners) fn();
};

export const openArchive = (board: string) => set({ kind: 'archive', board, n: ++n });
export const openDelete = (board: string) => set({ kind: 'delete', board, n: ++n });
export const closeArchiveDialog = () => set(null);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useArchiveDialog(): ArchiveDialog {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  );
}
