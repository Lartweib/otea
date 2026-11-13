import { isClosed, positionOf } from '../../src/core/board/engine.ts';
import { historyOf, roundsOfStep, withoutUndone } from '../../src/core/board/history.ts';
import { type BoardDefinition, stepIndex } from '../../src/core/board/model.ts';
import { relayOf } from './format.ts';
import type { Actor, Closing, Evidence, ItemEvent, State } from './types.ts';

// Rounds are read from an item's history, never stored. Round n ends with the agent's nth move into
// a state on the human's turn; that move's note (else its reason) is the round's note, and what was
// attached since the round before ended belongs to it. The human's next move is its verdict: back
// to a working state is "sent back", its reason the feedback; into a closed state ends the rounds.
// A move the person took back with Deshacer never happened.
//
// On a board the rounds are its step's, numbered as the step engine counts them
// (core/board/history.ts): only the handoffs of `step` (the step the item is on; once closed, the
// last one handed off), and a verdict that moves it on to a later step is "approved".

export type Verdict = {
  kind: 'sent-back' | 'approved' | 'closed';
  to: string;
  at: string;
  actor: Actor;
  reason?: string;
  closes?: Closing;
  // The agent that relayed it, when the human gave it in conversation.
  relayedBy?: string;
};

export type Round = {
  n: number;
  // The move that ended it.
  endedAt: string;
  to: string;
  by: Actor;
  note?: string;
  evidence: Evidence[];
  verdict?: Verdict;
};

export type BoardRounds = { def: BoardDefinition; step?: string };

const textOf = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;
const reasonOf = (event: ItemEvent) => textOf(event.data.reason);
const noteOf = (event: ItemEvent) => textOf(event.data.note) ?? reasonOf(event);

// The step a move left, on a board; undefined off its steps.
const stepLeft = (event: ItemEvent): string | undefined => {
  const from = positionOf(String(event.data.from));
  return isClosed(from) ? undefined : from.step;
};

// A verdict's kind on a board: closed, back to this step or an earlier one, or on to a later one.
function boardVerdict(def: BoardDefinition, step: string, to: string): Verdict['kind'] {
  const target = positionOf(to);
  if (isClosed(target)) return 'closed';
  return stepIndex(def, target.step) <= stepIndex(def, step) ? 'sent-back' : 'approved';
}

export function roundsOf(
  events: readonly ItemEvent[],
  evidence: readonly Evidence[],
  states: readonly State[],
  board?: BoardRounds,
): Round[] {
  const turn = new Map(states.map((state) => [state.name, state]));
  const live = withoutUndone([...events].sort((a, b) => a.id - b.id));
  const rounds: (Round & { step?: string })[] = [];
  let since = '';
  for (const event of live) {
    if (event.type !== 'transitioned') continue;
    const to = String(event.data.to);
    const state = turn.get(to);
    const open = rounds.at(-1);
    const relay = relayOf(event);
    if (event.actor.kind === 'agent' && !relay && state?.turn === 'human') {
      const note = board ? noteOf(event) : reasonOf(event);
      const step = board ? stepLeft(event) : undefined;
      rounds.push({
        n: rounds.length + 1,
        endedAt: event.at,
        to,
        by: event.actor,
        ...(note ? { note } : {}),
        evidence: evidence.filter(({ createdAt }) => createdAt > since && createdAt <= event.at),
        ...(step ? { step } : {}),
      });
      since = event.at;
      continue;
    }
    if (open && !open.verdict && (event.actor.kind === 'human' || relay)) {
      const reason = reasonOf(event);
      const closes = state?.closes;
      const kind =
        board && open.step
          ? boardVerdict(board.def, open.step, to)
          : state?.turn === 'none'
            ? 'closed'
            : 'sent-back';
      open.verdict = {
        kind,
        to,
        at: event.at,
        actor: event.actor,
        ...(reason ? { reason } : {}),
        ...(closes ? { closes } : {}),
        ...(relay ? { relayedBy: relay.via } : {}),
      };
    }
  }
  if (!board) return rounds;
  return stepRounds(board, live, rounds);
}

// A board's rounds of one step, numbered by the engine: each handoff is in the round of its step
// that was under way when it was made.
function stepRounds(
  board: BoardRounds,
  events: readonly ItemEvent[],
  rounds: (Round & { step?: string })[],
): Round[] {
  const step = board.step ?? rounds.at(-1)?.step;
  if (step === undefined) return [];
  const created = events.find(({ type }) => type === 'created');
  const history = historyOf(events, {
    initial: board.def.steps[0]?.id ?? step,
    createdAt: created?.at ?? '',
  });
  const starts = roundsOfStep(board.def, history, step);
  return rounds
    .filter((round) => round.step === step)
    .map(({ step: _, ...round }) => ({
      ...round,
      n: starts.findLast(({ at }) => at <= round.endedAt)?.round ?? 1,
    }));
}

// The files of a round a module draws, newest first; with the same file in the round before, the
// comparison of the two.
export function roundFiles(round: Round | undefined, module: string): Evidence[] {
  return (round?.evidence ?? [])
    .filter((entry) => entry.module === module)
    .sort((a, b) => b.id - a.id);
}
