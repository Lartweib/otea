import { OteaError } from './errors.ts';

export type Turn = 'human' | 'agent' | 'none';

export const TURNS: readonly Turn[] = ['human', 'agent', 'none'];

export type Authority = 'agent' | 'human' | 'human-ui';

export const AUTHORITIES: readonly Authority[] = ['agent', 'human', 'human-ui'];

// What reaching a closed state (turn none) means: the work is done, or it was thrown away.
export type Closing = 'done' | 'discarded';

export const CLOSINGS: readonly Closing[] = ['done', 'discarded'];

// What must hold before an item may enter a state, whatever its turn: `children_closed`, that none
// of its children is still open, and `blockers_closed`, that nothing that blocks it is. A state may
// require both. An item's state is never derived from its children's or its blockers'.
export const REQUIREMENTS = ['children_closed', 'blockers_closed'] as const;

export type Requirement = (typeof REQUIREMENTS)[number];

export type State = {
  name: string;
  // The name a reader knows the state by, when it is not its key: a board step's (Refinar (in
  // review)), whose state is a hidden id.
  label?: string;
  turn: Turn;
  closes?: Closing;
  requires?: Requirement[];
};

export type Transition = { from: string; to: string; by: Authority; reasonRequired: boolean };

// The actions an item allows by the state it is in: each named action (push, merge, publish, any
// word the preset picks) lists the states that allow it. Otea only answers; enforcing is the
// consumer's job.
export type Gates = Record<string, string[]>;

export type Workflow = {
  name: string;
  initial: string;
  incomplete?: string;
  states: State[];
  transitions: Transition[];
  gates?: Gates;
};

export function turnOf(workflow: Workflow, stateName: string): Turn {
  const state = workflow.states.find((candidate) => candidate.name === stateName);
  if (!state) throw new OteaError('not_found', `Unknown state "${stateName}" in ${workflow.name}`);
  return state.turn;
}

// How an item in the state is closed, or nothing while it is still open.
export function closesOf(workflow: Workflow, stateName: string): Closing | undefined {
  return workflow.states.find((candidate) => candidate.name === stateName)?.closes;
}

// What entering the state requires, in the order declared; empty when nothing.
export function requirementsOf(workflow: Workflow, stateName: string): Requirement[] {
  return workflow.states.find((candidate) => candidate.name === stateName)?.requires ?? [];
}

// Whether each action of the workflow's gates is allowed in the state; empty without gates.
export function gateVerdicts(workflow: Workflow, stateName: string): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(workflow.gates ?? {}).map(([action, states]) => [
      action,
      states.includes(stateName),
    ]),
  );
}

export function transitionsFrom(workflow: Workflow, from: string): Transition[] {
  return workflow.transitions.filter((transition) => transition.from === from);
}

export function transitionsBetween(workflow: Workflow, from: string, to: string): Transition[] {
  return transitionsFrom(workflow, from).filter((transition) => transition.to === to);
}

// A state as a reader names it: its label, or its key.
export function stateLabel(workflow: Workflow, state: string): string {
  return workflow.states.find(({ name }) => name === state)?.label ?? state;
}

export function assertTransition(workflow: Workflow, from: string, to: string): Transition[] {
  const transitions = transitionsBetween(workflow, from, to);
  if (transitions.length > 0) return transitions;
  const said = (state: string) => stateLabel(workflow, state);
  throw new OteaError('invalid_transition', `Cannot move from "${said(from)}" to "${said(to)}"`, {
    kind: 'move',
    why: 'no_move',
    from,
    to,
  });
}
