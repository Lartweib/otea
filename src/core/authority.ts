import { OteaError } from './errors.ts';
import type { Actor } from './item.ts';
import {
  type Authority,
  assertTransition,
  type Closing,
  closesOf,
  type Requirement,
  requirementOf,
  type Transition,
  type Turn,
  transitionsFrom,
  turnOf,
  type Workflow,
} from './workflow.ts';

export type Channel = 'cli' | 'mcp' | 'ui';

// The channels agents act through: the CLI and the MCP server, which serves the same commands.
export type AgentChannel = Exclude<Channel, 'ui'>;

export type Performer = { actor: Actor; channel: Channel };

const CHANNEL_REACH: Readonly<Record<Channel, readonly Authority[]>> = {
  cli: ['agent'],
  mcp: ['agent'],
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

// A move the performer may make, whose turn the item is on once it lands, for a move into a closed
// state how it closes the item, and what entering its state waits for (`children_closed`: every
// child closed).
export type Move = {
  to: string;
  by: Authority;
  reasonRequired: boolean;
  turn: Turn;
  closes?: Closing;
  requires?: Requirement;
};

function moveTo(workflow: Workflow, { to, by, reasonRequired }: Transition): Move {
  const move: Move = { to, by, reasonRequired, turn: turnOf(workflow, to) };
  const closes = closesOf(workflow, to);
  if (closes !== undefined) move.closes = closes;
  const requires = requirementOf(workflow, to);
  if (requires !== undefined) move.requires = requires;
  return move;
}

export function availableMoves(workflow: Workflow, from: string, performer: Performer): Move[] {
  const moves = new Map<string, Move>();
  for (const transition of transitionsFrom(workflow, from)) {
    const { to, by } = transition;
    if (moves.has(to) || !mayPerform(by, performer)) continue;
    moves.set(to, moveTo(workflow, transition));
  }
  return [...moves.values()];
}

// The moves a relayed decision may take from a state: the targets of its `human` transitions, as
// authorizeRelay allows them.
export function relayableMoves(workflow: Workflow, from: string): Move[] {
  const moves = new Map<string, Move>();
  for (const transition of transitionsFrom(workflow, from)) {
    const { to, by } = transition;
    if (moves.has(to) || by !== 'human') continue;
    moves.set(to, moveTo(workflow, transition));
  }
  return [...moves.values()];
}

function requireReason(transition: Transition, reason: string | undefined): void {
  if (transition.reasonRequired && !reason?.trim()) {
    const { from, to } = transition;
    throw new OteaError('reason_required', `Moving from "${from}" to "${to}" requires a reason`);
  }
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
  requireReason(allowed, reason);
  return allowed;
}

// A relayed decision is the human's, made in conversation and recorded by an agent: it may take
// only a `human` transition. `human-ui` stays in the web UI and `agent` moves need no human.
export function authorizeRelay(
  workflow: Workflow,
  from: string,
  to: string,
  reason?: string,
): Transition {
  const transitions = assertTransition(workflow, from, to);
  const human = transitions.find(({ by }) => by === 'human');
  if (human) {
    requireReason(human, reason);
    return human;
  }
  if (transitions.some(({ by }) => by === 'agent')) {
    throw new OteaError(
      'not_relayable',
      `Moving from "${from}" to "${to}" needs no human decision; make it with "otea move"`,
    );
  }
  throw new OteaError(
    'forbidden',
    `Moving from "${from}" to "${to}" requires human-ui authority (${WHO['human-ui']}) and cannot be relayed; the human must make it in the web UI`,
  );
}
