import { SAME } from '../../../src/core/board/model.ts';
import type { BoardSummary } from './api.ts';
import type { ReadyDraft } from './use-board-draft.ts';

// Boards that work as one: a board that "se divide en" another board is edited in one workspace
// with that child board (paired tabs, both routes, one Publicar, one Descartar, one undo history),
// and boards a template set made together without a split (Producto) open each other from the
// bar. This module says which boards those are; the editor builds the workspace (editor slice),
// the dialogs publish, discard and undo it (preview slice) and the home draws its row (pages slice).

export type PairRole = 'parent' | 'child';

// The two board ids of a joined pair.
export type PairIds = { parent: string; child: string; always: boolean };

// The pair a board belongs to, from the home's summaries (each carries its definition, the draft
// or the live version): the board whose split names another board, and that board. A board that
// divides into its own items is no pair.
export function pairOf(boards: readonly BoardSummary[], id: string): PairIds | undefined {
  for (const board of boards) {
    const split = board.definition.split;
    if (!split || split.board === SAME || split.board === board.id) continue;
    if (board.id !== id && split.board !== id) continue;
    if (!boards.some((other) => other.id === split.board)) continue;
    return { parent: board.id, child: split.board, always: split.always };
  }
  return undefined;
}

// The boards made together with `id` by a template set that stay apart (no split joins them):
// Producto's Tareas and Errores.
export function madeWithOf(boards: readonly BoardSummary[], id: string): BoardSummary[] {
  const board = boards.find((candidate) => candidate.id === id);
  const others = new Set(board?.definition.madeWith ?? []);
  const pair = pairOf(boards, id);
  return boards.filter(
    (other) => others.has(other.id) && other.id !== pair?.parent && other.id !== pair?.child,
  );
}

// The workspace of a joined pair, as the editor holds it and the dialogs read it. `active` is the
// board whose card, previews and "Sobre…" show; `select` switches board and selection at once.
export type PairWorkspace = {
  ids: PairIds;
  parent: ReadyDraft;
  child: ReadyDraft;
  active: PairRole;
  setActive: (role: PairRole) => void;
};

// The draft of a role.
export function draftOf(pair: PairWorkspace, role: PairRole = pair.active): ReadyDraft {
  return role === 'parent' ? pair.parent : pair.child;
}
