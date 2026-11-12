import { moveBlock, moveVariants, type Waits } from '../../actions.ts';
import { t } from '../../i18n/i18n.ts';
import type { Move } from '../../types.ts';

// The moves of the open item (SPEC §10.3, mock:2689-2702), planned from its transitions, never from
// state names: one primary (Approve, or Mark done on your own step), the quiet moves (Send back…,
// Move to X), and closing as discarded after a rule, named by its state.

export type MoveKind = 'approve' | 'own' | 'sendback' | 'move' | 'discard';

// `deliver`: on a board, your own step's primary hands it off (Entregar) rather than closing it.
export type MoveChoice = {
  move: Move;
  kind: MoveKind;
  label: string;
  blocked?: string;
  deliver?: boolean;
};

export type MovePlan = { primary: MoveChoice | null; quiet: MoveChoice[]; close: MoveChoice[] };

const cap = (s: string) => (s ? s[0]?.toLocaleUpperCase() + s.slice(1) : s);

export function planMoves(
  moves: readonly Move[],
  o: { own: boolean; word: (state: string) => string; waits?: Waits },
): MovePlan {
  const variants = moveVariants(moves, o.waits);
  const backs = moves.filter((m) => m.reasonRequired && m.turn === 'agent' && !m.closes).length;
  const plan: MovePlan = { primary: null, quiet: [], close: [] };
  moves.forEach((move, i) => {
    const blocked = moveBlock(move, o.waits);
    const extra = blocked ? { blocked } : {};
    if (move.closes === 'discarded') {
      plan.close.push({ move, kind: 'discard', label: cap(o.word(move.to)), ...extra });
    } else if (variants[i] === 'primary') {
      plan.primary = {
        move,
        kind: o.own ? 'own' : 'approve',
        label: t(o.own ? 'sheet.move.own' : 'sheet.move.approve'),
      };
    } else if (move.reasonRequired && move.turn === 'agent') {
      plan.quiet.push({
        move,
        kind: 'sendback',
        label:
          backs > 1
            ? t('sheet.move.sendBackTo', { state: o.word(move.to) })
            : t('sheet.move.sendBack'),
        ...extra,
      });
    } else {
      plan.quiet.push({
        move,
        kind: 'move',
        label: t('sheet.move.moveTo', { state: o.word(move.to) }),
        ...extra,
      });
    }
  });
  return plan;
}

export type Says = { verb: string; state: string; tail: string };

// The line under the moves: "Approve → fixed · it closes" (the component bolds the arrow and state).
export function moveSaysOf(
  choice: MoveChoice,
  o: {
    agent: string | null;
    round: number;
    word: (state: string) => string;
    // On a board: the agent and round the move lands on (a way back may go to another step).
    back?: ((state: string) => { agent: string | null; round: number }) | undefined;
  },
): Says {
  const { move, kind } = choice;
  const state = o.word(move.to);
  const verb =
    kind === 'approve'
      ? t('sheet.move.approve')
      : kind === 'own'
        ? choice.label
        : kind === 'sendback'
          ? t('sheet.move.sendBackVerb')
          : kind === 'discard'
            ? t('sheet.move.discard')
            : t('sheet.move.move');
  let tail: string;
  if (kind === 'sendback') {
    const lands = o.back?.(move.to) ?? { agent: o.agent, round: o.round + 1 };
    tail = lands.agent
      ? t('sheet.says.back', { agent: lands.agent, round: lands.round })
      : t('sheet.says.backAgent', { round: lands.round });
  } else if (move.closes === 'discarded') tail = t('sheet.says.closesUndone');
  else if (move.closes || move.turn === 'none') tail = t('sheet.says.closes');
  else if (move.turn === 'agent') {
    // On a board, the agent of the step it lands on (none named when any agent may take it).
    const who = o.back ? o.back(move.to).agent : o.agent;
    tail = who ? t('sheet.says.agent', { agent: who }) : t('sheet.says.anAgent');
  } else tail = t('sheet.says.yours');
  if (choice.blocked) tail = choice.blocked;
  return { verb, state, tail };
}
