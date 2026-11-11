import { moveVariants } from '../../actions.ts';
import { inverseMove } from '../../app/context.tsx';
import { t } from '../../i18n/i18n.ts';
import type { Item, Move, TypeView } from '../../types.ts';

// The tray under ticked rows (SPEC §10.1, mock:3738-3844, today's bulk.ts): what its buttons say
// and in what order, what its count line says, and whether a run can be undone.

export type TrayButton = {
  move: Move;
  label: string;
  variant: 'primary' | 'quiet' | 'text';
  // The first closing move: "cerrar como" goes before it.
  closeAs: boolean;
  // It asks a reason, once, for the whole run.
  reason: boolean;
};

// Moves named as the detail names them, never by their state alone: the primary is Aprobar, a move
// back to an agent with your notes is Devolver…, a move that throws work away is named by its
// state after "cerrar como", any other is "Mover a {state}".
export function trayButtons(moves: readonly Move[], word: (state: string) => string): TrayButton[] {
  const variants = moveVariants(moves);
  const backs = moves.filter((m) => m.reasonRequired && m.turn === 'agent').length;
  const all = moves.map((move, i): TrayButton => {
    const v = variants[i];
    const closing = move.closes === 'discarded';
    const label =
      v === 'primary'
        ? t('boardView.tray.approve')
        : move.reasonRequired && move.turn === 'agent'
          ? backs > 1
            ? t('boardView.tray.sendBackTo', { state: word(move.to) })
            : t('boardView.tray.sendBack')
          : closing
            ? word(move.to)
            : t('common.moveTo', { state: word(move.to) });
    return {
      move,
      label,
      variant: v === 'primary' ? 'primary' : closing ? 'text' : 'quiet',
      closeAs: false,
      reason: move.reasonRequired,
    };
  });
  const open = all.filter((b) => b.move.closes !== 'discarded');
  const primary = open.filter((b) => b.variant === 'primary');
  const ordered = [
    ...primary,
    ...open.filter((b) => b.variant !== 'primary'),
    ...all.filter((b) => b.move.closes === 'discarded'),
  ];
  const first = ordered.findIndex((b) => b.move.closes === 'discarded');
  return ordered.map((b, i) => (i === first ? { ...b, closeAs: true } : b));
}

// "2 en Comprobado · 1 en Triaje": each state with how many, in the order they were ticked.
export function trayStates(items: readonly Item[], word: (state: string) => string): string {
  const by = new Map<string, number>();
  for (const it of items) by.set(it.state, (by.get(it.state) ?? 0) + 1);
  return [...by]
    .map(([state, count]) => t('boardView.tray.inState', { count, state: word(state) }))
    .join(' · ');
}

// A run is undone only when every item it moved has a move of yours straight back.
export function undoable(
  moved: readonly { id?: string; from: string; to: string }[],
  typeOf: (id: string | undefined) => Pick<TypeView, 'transitions'> | undefined,
): boolean {
  return (
    moved.length > 0 &&
    moved.every(({ id, from, to }) => inverseMove(typeOf(id) as TypeView | undefined, from, to))
  );
}
