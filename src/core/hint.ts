import type { Lease } from './lease.ts';
import { type Transition, transitionsFrom, turnOf, type Workflow } from './workflow.ts';

// What the next step is built from: where the item stands, who holds it, what it still lacks (its
// fields, while incomplete, and its required evidence modules still empty), how many children are
// open, and the playbook's own words for its state when the playbook has a section for it.
export type HintInput = {
  state: string;
  lease: Lease | null;
  missing: string[];
  emptyRequired: string[];
  openChildren: number;
  section?: string;
};

export function clockTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function and(words: readonly string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

function sequence(steps: readonly string[]): string {
  if (steps.length < 2) return steps.join('');
  return `${steps.slice(0, -1).join(', ')}, then ${steps.at(-1)}`;
}

// The agent moves that bring the item back to the human, shortest first, never through a closed
// state. Leaving the incomplete state is a step of its own: the path ends where it lands.
function shortestPath(
  workflow: Workflow,
  from: string,
  forward: (state: string) => Transition[],
): Transition[] {
  if (from === workflow.incomplete) return forward(from).slice(0, 1);
  const paths = new Map<string, Transition[]>([[from, []]]);
  const queue = [from];
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    const path = paths.get(state) ?? [];
    if (state !== from && turnOf(workflow, state) === 'human') return path;
    for (const transition of forward(state)) {
      if (paths.has(transition.to)) continue;
      paths.set(transition.to, [...path, transition]);
      queue.push(transition.to);
    }
  }
  return [];
}

// Work moves on through the states in the order the workflow declares them; a path that goes back
// (handing a fix back to triage) is taken only when none goes forward.
function pathToHuman(workflow: Workflow, from: string): Transition[] {
  const order = (state: string) => workflow.states.findIndex(({ name }) => name === state);
  const moves = (state: string) =>
    transitionsFrom(workflow, state).filter(
      ({ by, to }) => by === 'agent' && turnOf(workflow, to) !== 'none',
    );
  const ahead = (state: string) => moves(state).filter(({ to }) => order(to) > order(state));
  const path = shortestPath(workflow, from, ahead);
  return path.length > 0 ? path : shortestPath(workflow, from, moves);
}

function handOver(workflow: Workflow, last: Transition, input: HintInput): string {
  const { to, reasonRequired } = last;
  const human = turnOf(workflow, to) === 'human';
  const evidence = !human
    ? ''
    : input.emptyRequired.length > 0
      ? ` with evidence in ${and(input.emptyRequired)}`
      : ' with evidence';
  const reason = !reasonRequired ? '' : evidence ? ' and a reason' : ' with a reason';
  const waits =
    workflow.states.find(({ name }) => name === to)?.requires === 'children_closed' &&
    input.openChildren > 0;
  const children =
    input.openChildren === 1 ? '1 open child is' : `${input.openChildren} open children are`;
  return `move it to ${to}${evidence}${reason}${waits ? ` once its ${children} closed` : ''}`;
}

function agentStep(workflow: Workflow, input: HintInput, mine: boolean): string {
  const steps = mine ? [] : ['claim it'];
  const incomplete = input.state === workflow.incomplete;
  if (incomplete && input.missing.length > 0) steps.push(`fill in ${and(input.missing)}`);
  const path = pathToHuman(workflow, input.state);
  const last = path.at(-1);
  if (!last) {
    return `${[...steps, 'work it'].join(' and ')}; no move of yours leaves ${input.state} (see otea playbook)`;
  }
  if (incomplete) return sequence([...steps, `move it to ${last.to}`]);
  const through = path.slice(0, -1).map(({ to }) => `move it to ${to}`);
  return sequence([...steps, ...through, 'work it', handOver(workflow, last, input)]);
}

// What the agent should do now, in one line: derived from the item's turn, lease and workflow,
// never written per preset. `me` is the agent asking.
export function nextStep(
  workflow: Workflow,
  input: HintInput,
  me: string,
  clock: (iso: string) => string = clockTime,
): string {
  const { lease, section } = input;
  if (lease && lease.holder !== me) {
    return `Held by ${lease.holder} until ${clock(lease.expiresAt)}: pick another item.`;
  }
  const turn = turnOf(workflow, input.state);
  if (turn === 'none') {
    const closes = workflow.states.find(({ name }) => name === input.state)?.closes;
    return `Closed (${closes}): ${section ?? 'nothing left to do.'}`;
  }
  if (turn === 'human') return `Human's turn: ${section ?? 'wait (otea wait).'}`;
  const mine = lease !== null;
  const prefix = mine ? `Your turn (you hold it until ${clock(lease.expiresAt)})` : 'Your turn';
  return `${prefix}: ${section ?? `${agentStep(workflow, input, mine)}.`}`;
}

const HEADING = /^#{2,6}\s+(.*)$/;

function headingName(text: string): string {
  return text
    .replace(/^\d+\.\s*/, '')
    .replaceAll('`', '')
    .trim();
}

// The first paragraph under a playbook heading that names the state (`## in_progress`,
// `### 3. \`review\``), as one line, or nothing when no heading names it.
export function playbookSection(playbook: string, state: string): string | undefined {
  const lines = playbook.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = HEADING.exec(line);
    return heading?.[1] !== undefined && headingName(heading[1]) === state;
  });
  if (start < 0) return undefined;
  const paragraph: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    if (line.trim() === '') {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line.trim());
  }
  return paragraph.length > 0 ? paragraph.join(' ') : undefined;
}
