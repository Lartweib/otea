import { relayOf } from './format.ts';
import type { Actor, Closing, Evidence, ItemEvent, State } from './types.ts';

// Rounds are read from an item's history, never stored. Round n ends with the agent's nth move into
// a state on the human's turn; that move's reason is the round's note, and what was attached since
// the round before ended belongs to it. The human's next move is its verdict: back to a working
// state is "sent back", its reason the feedback; into a closed state ends the rounds.

export type Verdict = {
  kind: 'sent-back' | 'closed';
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

const reasonOf = (event: ItemEvent) =>
  typeof event.data.reason === 'string' && event.data.reason !== '' ? event.data.reason : undefined;

export function roundsOf(
  events: readonly ItemEvent[],
  evidence: readonly Evidence[],
  states: readonly State[],
): Round[] {
  const turn = new Map(states.map((state) => [state.name, state]));
  const rounds: Round[] = [];
  let since = '';
  for (const event of [...events].sort((a, b) => a.id - b.id)) {
    if (event.type !== 'transitioned') continue;
    const to = String(event.data.to);
    const state = turn.get(to);
    const open = rounds.at(-1);
    const relay = relayOf(event);
    if (event.actor.kind === 'agent' && !relay && state?.turn === 'human') {
      const note = reasonOf(event);
      rounds.push({
        n: rounds.length + 1,
        endedAt: event.at,
        to,
        by: event.actor,
        ...(note ? { note } : {}),
        evidence: evidence.filter(({ createdAt }) => createdAt > since && createdAt <= event.at),
      });
      since = event.at;
      continue;
    }
    if (open && !open.verdict && (event.actor.kind === 'human' || relay)) {
      const reason = reasonOf(event);
      const closes = state?.closes;
      open.verdict = {
        kind: state?.turn === 'none' ? 'closed' : 'sent-back',
        to,
        at: event.at,
        actor: event.actor,
        ...(reason ? { reason } : {}),
        ...(closes ? { closes } : {}),
        ...(relay ? { relayedBy: relay.via } : {}),
      };
    }
  }
  return rounds;
}

// The files of a round a module draws, newest first; with the same file in the round before, the
// comparison of the two.
export function roundFiles(round: Round | undefined, module: string): Evidence[] {
  return (round?.evidence ?? [])
    .filter((entry) => entry.module === module)
    .sort((a, b) => b.id - a.id);
}
