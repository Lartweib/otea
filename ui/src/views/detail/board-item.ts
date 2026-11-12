import {
  isClosed,
  positionOf,
  roundsOf,
  type Transition,
  turnAt,
} from '../../../../src/core/board/engine.ts';
import { type BoardDefinition, DONE, stepById } from '../../../../src/core/board/model.ts';
import {
  type DefinitionRoute,
  definitionRoute,
  type RouteWords,
} from '../../board-studio/preview/route.ts';
import type { ItemEvent } from '../../types.ts';

// An item on a published board, as the step engine reads it: the agent whose turn it is by the
// board (the step's own agent, or the reviewer's), the round of the step it is on, and its route
// drawn from the definition, the same route Studio's preview draws. The preset the board compiles
// to knows only "an agent" and a column per review, so the item page asks the board instead.

export type BoardItem = { agent: string | null; round: number; route: DefinitionRoute };

type ItemLike = { state: string; createdAt: string; events: readonly ItemEvent[] };

const transitionsOf = (events: readonly ItemEvent[]): Transition[] =>
  events.flatMap((e) =>
    e.type === 'transitioned' && typeof e.data.from === 'string' && typeof e.data.to === 'string'
      ? [{ from: e.data.from, to: e.data.to, at: e.at }]
      : [],
  );

// Null when the item's state is not one of the board's (a collection still on a preset, or a
// dropped item, which the route has no stop for).
export function boardItemOf(
  def: BoardDefinition,
  item: ItemLike,
  words: RouteWords,
): BoardItem | null {
  const position = positionOf(item.state);
  if (isClosed(position) ? position.closed !== DONE : !stepById(def, position.step)) return null;
  const created = item.events.find((e) => e.type === 'created')?.data.state;
  const initial = typeof created === 'string' ? created : (def.steps[0]?.id ?? item.state);
  const rounds = roundsOf(def, initial, item.createdAt, transitionsOf(item.events));
  const turn = turnAt(def, position);
  const agent = turn.who === 'agent' ? (turn.agent ?? null) : null;
  const round = isClosed(position) ? 0 : (rounds.rounds[position.step] ?? 1);
  const at = isClosed(position) ? DONE : { step: position.step, phase: position.phase };
  return { agent, round, route: definitionRoute(def, at, rounds.dips, words) };
}
