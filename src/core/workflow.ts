import { OteaError } from './errors.ts';

export type Turn = 'human' | 'agent' | 'none';

export const TURNS: readonly Turn[] = ['human', 'agent', 'none'];

export type State = { name: string; turn: Turn };

export type Workflow = {
  name: string;
  initial: string;
  states: State[];
  transitions: Record<string, string[]>;
};

export const tasks: Workflow = {
  name: 'tasks',
  initial: 'todo',
  states: [
    { name: 'todo', turn: 'agent' },
    { name: 'in_progress', turn: 'agent' },
    { name: 'review', turn: 'human' },
    { name: 'done', turn: 'none' },
    { name: 'discarded', turn: 'none' },
  ],
  transitions: {
    todo: ['in_progress', 'discarded'],
    in_progress: ['review', 'discarded'],
    review: ['done', 'todo', 'discarded'],
  },
};

export function turnOf(workflow: Workflow, stateName: string): Turn {
  const state = workflow.states.find((candidate) => candidate.name === stateName);
  if (!state) throw new OteaError('not_found', `Unknown state "${stateName}" in ${workflow.name}`);
  return state.turn;
}

export function canTransition(workflow: Workflow, from: string, to: string): boolean {
  return workflow.transitions[from]?.includes(to) ?? false;
}

export function assertTransition(workflow: Workflow, from: string, to: string): void {
  if (canTransition(workflow, from, to)) return;
  throw new OteaError('invalid_transition', `Cannot move from "${from}" to "${to}"`);
}
