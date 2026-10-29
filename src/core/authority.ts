import { OteaError } from './errors.ts';
import type { Actor } from './item.ts';
import {
  type Authority,
  assertTransition,
  type Transition,
  type Turn,
  transitionsFrom,
  turnOf,
  type Workflow,
} from './workflow.ts';

export type Channel = 'cli' | 'ui';

export type Performer = { actor: Actor; channel: Channel };

const CHANNEL_REACH: Readonly<Record<Channel, readonly Authority[]>> = {
  cli: ['agent'],
  ui: ['agent', 'human', 'human-ui'],
};

const WHO: Readonly<Record<Authority, string>> = {
  agent: 'any actor',
  human: 'a human',
  'human-ui': 'a human in the web UI',
};

export function mayPerform(by: Authority, { actor, channel }: Performer): boolean {
  if (!CHANNEL_REACH[channel].includes(by)) return false;
  return by === 'agent' || actor.kind === 'human';
}

function forbidden(from: string, to: string, transitions: Transition[], performer: Performer) {
  const required = [...new Set(transitions.map(({ by }) => `${by} authority (${WHO[by]})`))];
  const { actor, channel } = performer;
  return new OteaError(
    'forbidden',
    `Moving from "${from}" to "${to}" requires ${required.join(' or ')}; ${actor.kind} "${actor.name}" via ${channel} may not`,
  );
}

// A move the performer may make, and whose turn the item is on once it lands.
export type Move = { to: string; by: Authority; reasonRequired: boolean; turn: Turn };

export function availableMoves(workflow: Workflow, from: string, performer: Performer): Move[] {
  const moves = new Map<string, Move>();
  for (const { to, by, reasonRequired } of transitionsFrom(workflow, from)) {
    if (moves.has(to) || !mayPerform(by, performer)) continue;
    moves.set(to, { to, by, reasonRequired, turn: turnOf(workflow, to) });
  }
  return [...moves.values()];
}

export function authorizeMove(
  workflow: Workflow,
  from: string,
  to: string,
  performer: Performer,
  reason?: string,
): Transition {
  const transitions = assertTransition(workflow, from, to);
  const allowed = transitions.find(({ by }) => mayPerform(by, performer));
  if (!allowed) throw forbidden(from, to, transitions, performer);
  if (allowed.reasonRequired && !reason?.trim()) {
    throw new OteaError('reason_required', `Moving from "${from}" to "${to}" requires a reason`);
  }
  return allowed;
}
