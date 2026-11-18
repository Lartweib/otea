import { type ItemChoice, pickableOptions } from '../../../../src/core/board/choices.ts';
import { isClosed, positionOf } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  DONE,
  stepById,
  stepIndex,
} from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import type { DecisionOption } from '../../options.ts';
import type { MoveChoice, MovePlan } from './moves.ts';

// Reviewing an item that carries a decision's options (a long text the board shows as options,
// with two or more), you pick one, with a comment if you like, as you approve it: every way on is
// «Elegir → <step>» or «Elegir y cerrar», side by side, so where it goes after the pick is a choice
// of the same weight. The option starts on the one you picked before, else the agent's
// recommendation. Sending it back carries no pick.

export type Pick = {
  options: DecisionOption[];
  // The option the form starts on: your last pick, else the recommended one, else none.
  start: string | null;
  chosen?: ItemChoice;
};

export function pickOf(
  def: BoardDefinition | undefined,
  item: { state: string; fields: Readonly<Record<string, unknown>> },
  chosen: ItemChoice | undefined,
): Pick | undefined {
  if (!def) return undefined;
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase !== 'review') return undefined;
  if (stepById(def, position.step)?.reviewer !== 'you') return undefined;
  const found = pickableOptions(def, item.fields);
  if (!found) return undefined;
  const { options } = found;
  const before = chosen && options.some(({ letter }) => letter === chosen.option);
  const start = before
    ? chosen.option
    : (options.find(({ recommended }) => recommended)?.letter ?? null);
  return { options, start, ...(chosen ? { chosen } : {}) };
}

// The ways on out of the review, each named for the pick: its approval and the moves to a later
// step or to Done, in that order. What stays is the rest of the plan (the send-backs, the closes).
export function pickWays(
  plan: MovePlan,
  def: BoardDefinition,
  stepId: string,
  word: (state: string) => string,
): { ways: MoveChoice[]; rest: MovePlan } {
  const at = stepIndex(def, stepId);
  const forward = (c: MoveChoice) => {
    if (c.move.closes === 'done') return true;
    const to = positionOf(c.move.to);
    return !isClosed(to) && to.phase === 'doing' && stepIndex(def, to.step) > at;
  };
  const named = (c: MoveChoice): MoveChoice => ({
    ...c,
    kind: 'approve',
    label:
      c.move.closes === 'done' || c.move.to === DONE
        ? t('pick.close')
        : t('pick.to', { step: word(c.move.to) }),
  });
  const primary = plan.primary && plan.primary.kind === 'approve' ? [plan.primary] : [];
  const moves = plan.quiet.filter((c) => c.kind === 'move' && forward(c));
  return {
    ways: [...primary, ...moves].map(named),
    rest: {
      primary: primary.length ? null : plan.primary,
      quiet: plan.quiet.filter((c) => !moves.includes(c)),
      close: plan.close,
    },
  };
}
