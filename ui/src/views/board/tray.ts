import { moveVariants } from '../../actions.ts';
import { t } from '../../i18n/i18n.ts';
import type { Item, Move } from '../../types.ts';

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

// The row of buttons: the moves the selection shares, the main one first; the closing moves
// gather behind one "Cerrar como" button.
export function trayGroups(buttons: readonly TrayButton[]): {
  main: TrayButton[];
  closing: TrayButton[];
} {
  return {
    main: buttons.filter((b) => b.move.closes !== 'discarded'),
    closing: buttons.filter((b) => b.move.closes === 'discarded'),
  };
}

// The notice under the buttons, one plain sentence: reading, nothing shared, or only the shared
// moves showing. `why` when there are moves left out to name behind "por qué".
export function trayNotice(
  plan: {
    moves: readonly Move[];
    hidden: readonly { moves: readonly string[] }[];
    loading: boolean;
  },
  count: number,
): { say: string; why: boolean } | null {
  if (plan.loading) return { say: t('boardView.tray.reading'), why: false };
  const why = plan.hidden.some((h) => h.moves.length > 0);
  if (!plan.moves.length) return { say: t('boardView.tray.noneShared', { count }), why };
  if (why) return { say: t('boardView.tray.someShared', { count }), why };
  return null;
}
