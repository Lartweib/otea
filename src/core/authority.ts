import { OteaError } from './errors.ts';
import type { Actor } from './item.ts';
import {
  type Authority,
  assertTransition,
  type Closing,
  closesOf,
  type Requirement,
  requirementsOf,
  stateLabel,
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

// A move as a reader says it, its states by name.
function moving(workflow: Workflow, from: string, to: string): string {
  return `Moving from "${stateLabel(workflow, from)}" to "${stateLabel(workflow, to)}"`;
}

function forbidden(
  workflow: Workflow,
  from: string,
  to: string,
  transitions: Transition[],
  performer: Performer,
) {
  const required = [...new Set(transitions.map(({ by }) => `${by} authority (${WHO[by]})`))];
  const { actor, channel } = performer;
  return new OteaError(
    'forbidden',
    `${moving(workflow, from, to)} requires ${required.join(' or ')}; ${actor.kind} "${actor.name}" via ${channel} may not`,
    { kind: 'move', why: 'not_allowed', from, to },
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
  requires?: Requirement[];
};

function moveTo(workflow: Workflow, { to, by, reasonRequired }: Transition): Move {
  const move: Move = { to, by, reasonRequired, turn: turnOf(workflow, to) };
  const closes = closesOf(workflow, to);
  if (closes !== undefined) move.closes = closes;
  const requires = requirementsOf(workflow, to);
  if (requires.length > 0) move.requires = requires;
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

function requireReason(workflow: Workflow, transition: Transition, reason?: string): void {
  if (transition.reasonRequired && !reason?.trim()) {
    const { from, to } = transition;
    throw new OteaError('reason_required', `${moving(workflow, from, to)} requires a reason`, {
      kind: 'move',
      why: 'reason_required',
      from,
      to,
    });
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
  if (!allowed) throw forbidden(workflow, from, to, transitions, performer);
  requireReason(workflow, allowed, reason);
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
    requireReason(workflow, human, reason);
    return human;
  }
  if (transitions.some(({ by }) => by === 'agent')) {
    throw new OteaError(
      'not_relayable',
      `${moving(workflow, from, to)} needs no human decision; make it with "otea move"`,
    );
  }
  throw new OteaError(
    'forbidden',
    `${moving(workflow, from, to)} requires human-ui authority (${WHO['human-ui']}) and cannot be relayed; the human must make it in the web UI`,
  );
}
