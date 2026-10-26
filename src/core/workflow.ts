import { OteaError } from './errors.ts';

export type Turn = 'human' | 'agent' | 'none';

export const TURNS: readonly Turn[] = ['human', 'agent', 'none'];

export type Authority = 'agent' | 'human' | 'human-ui';

export const AUTHORITIES: readonly Authority[] = ['agent', 'human', 'human-ui'];

export type State = { name: string; turn: Turn };

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
