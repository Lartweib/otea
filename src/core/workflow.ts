import { OteaError } from './errors.ts';

export type Turn = 'human' | 'agent' | 'none';

export const TURNS: readonly Turn[] = ['human', 'agent', 'none'];

export type Authority = 'agent' | 'human' | 'human-ui';

export const AUTHORITIES: readonly Authority[] = ['agent', 'human', 'human-ui'];

// What reaching a closed state (turn none) means: the work is done, or it was thrown away.
export type Closing = 'done' | 'discarded';

export const CLOSINGS: readonly Closing[] = ['done', 'discarded'];

// What must hold before an item may enter a closed state: `children_closed`, that none of its
// children is still open. A parent's state is never derived from its children.
export const CLOSE_REQUIREMENTS = ['children_closed'] as const;

export type CloseRequirement = (typeof CLOSE_REQUIREMENTS)[number];

export type State = {
  name: string;
  turn: Turn;
  closes?: Closing;
  closeRequires?: CloseRequirement;
};

export type Transition = { from: string; to: string; by: Authority; reasonRequired: boolean };

export type Workflow = {
  name: string;
  initial: string;
  incomplete?: string;
  states: State[];
  transitions: Transition[];
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

// What entering the state requires, if anything.
export function closeRequirementOf(
  workflow: Workflow,
  stateName: string,
): CloseRequirement | undefined {
  return workflow.states.find((candidate) => candidate.name === stateName)?.closeRequires;
}

export function transitionsFrom(workflow: Workflow, from: string): Transition[] {
  return workflow.transitions.filter((transition) => transition.from === from);
}

export function transitionsBetween(workflow: Workflow, from: string, to: string): Transition[] {
  return transitionsFrom(workflow, from).filter((transition) => transition.to === to);
}

export function assertTransition(workflow: Workflow, from: string, to: string): Transition[] {
  const transitions = transitionsBetween(workflow, from, to);
  if (transitions.length > 0) return transitions;
  throw new OteaError('invalid_transition', `Cannot move from "${from}" to "${to}"`);
}
