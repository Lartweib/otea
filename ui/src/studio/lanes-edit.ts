import { t } from '../i18n/i18n.ts';
import {
  asList,
  pushIn,
  type RawPreset,
  type RawState,
  type RawTransition,
  setIn,
  workflowOf,
  workflowPath,
} from './draft.ts';

// The workflow on the lanes, edited where it is drawn: a state's turn, how it closes and what
// entering it waits for; a move's maker and its reason. `requires` lives on the state a move enters.

export type Turn = 'agent' | 'human' | 'none';
export type Closes = 'done' | 'discarded';
export type Requirement = 'blockers_closed' | 'children_closed';
export type By = 'agent' | 'human' | 'human-ui';

const stateAt = (raw: RawPreset, type: string, name: string) =>
  [...workflowPath(raw, type), 'states', name] as const;

function stateOf(raw: RawPreset, type: string, name: string): RawState {
  return workflowOf(raw, type).states?.[name] ?? {};
}

// A state on a lane is open; leaving the lanes (turn none) it closes, as discarded until said.
export function setTurn(yaml: string, raw: RawPreset, type: string, name: string, turn: Turn) {
  const { closes, ...rest } = stateOf(raw, type, name);
  const next: RawState =
    turn === 'none' ? { ...rest, turn, closes: closes ?? 'discarded' } : { ...rest, turn };
  return setIn(yaml, stateAt(raw, type, name), next);
}

export function setCloses(
  yaml: string,
  raw: RawPreset,
  type: string,
  name: string,
  closes: Closes | undefined,
) {
  const { closes: _was, turn, ...rest } = stateOf(raw, type, name);
  const next: RawState =
    closes === undefined
      ? { ...rest, turn: turn === 'none' || turn === undefined ? 'agent' : turn }
      : { ...rest, turn: 'none', closes };
  return setIn(yaml, stateAt(raw, type, name), next);
}

export function setRequires(
  yaml: string,
  raw: RawPreset,
  type: string,
  name: string,
  requirement: Requirement,
  on: boolean,
) {
  const state = stateOf(raw, type, name);
  const current = asList(state.requires);
  const kept = on
    ? [...current.filter((each) => each !== requirement), requirement]
    : current.filter((each) => each !== requirement);
  const { requires: _was, ...rest } = state;
  return setIn(
    yaml,
    stateAt(raw, type, name),
    kept.length > 0 ? { ...rest, requires: kept } : rest,
  );
}

type RawLabels = Record<string, { states?: Record<string, string> } | undefined>;

// A new state on a lane, named in every language the preset speaks as its key until worded.
export function addState(yaml: string, raw: RawPreset, type: string, name: string, turn: Turn) {
  let next = setIn(yaml, stateAt(raw, type, name), { turn });
  const labels = ((raw as { labels?: RawLabels }).labels ?? {}) as RawLabels;
  for (const language of Object.keys(labels))
    next = setIn(next, ['labels', language, 'states', name], name);
  return next;
}

export function addMove(
  yaml: string,
  raw: RawPreset,
  type: string,
  from: string,
  to: string,
  by: By,
) {
  return pushIn(yaml, [...workflowPath(raw, type), 'transitions'], { from, to, by });
}

export function setMove(
  yaml: string,
  raw: RawPreset,
  type: string,
  index: number,
  patch: { by?: By; reason?: 'required' | undefined },
) {
  const move = workflowOf(raw, type).transitions?.[index];
  if (!move) return yaml;
  const next: RawTransition = { ...move };
  if (patch.by !== undefined) next.by = patch.by;
  if ('reason' in patch) {
    if (patch.reason === undefined) delete next.reason;
    else next.reason = patch.reason;
  }
  return setIn(yaml, [...workflowPath(raw, type), 'transitions', index], next);
}

export function removeMove(yaml: string, raw: RawPreset, type: string, index: number) {
  return setIn(yaml, [...workflowPath(raw, type), 'transitions', index], undefined);
}

// Who may make a move into a state: an agent never closes an item as done.
export function byChoices(
  raw: RawPreset,
  type: string,
  to: string,
): Array<{ value: By; struck?: string }> {
  const done = stateOf(raw, type, to).closes === 'done';
  return [
    done ? { value: 'agent', struck: t('studio.lanes.agentNeverDone') } : { value: 'agent' },
    { value: 'human' },
    { value: 'human-ui' },
  ];
}

export type WayOut = {
  index: number;
  to: string;
  by: string | undefined;
  reason: string | undefined;
};

export function waysOut(raw: RawPreset, type: string, name: string): WayOut[] {
  return (workflowOf(raw, type).transitions ?? []).flatMap((move, index) =>
    asList(move.from).includes(name)
      ? [{ index, to: move.to ?? '', by: move.by, reason: move.reason }]
      : [],
  );
}

// ---------------------------------------------------------------- layout

export type PlacedState = { name: string; turn: string; closes?: string; x: number; y: number };
export type PlacedMove = {
  index: number;
  from: string;
  to: string;
  by: string;
  reason: boolean;
  // The first edge of a move that leaves several states carries its label.
  labelled: boolean;
};
export type LaneLayout = {
  states: PlacedState[];
  moves: PlacedMove[];
  agentX: number;
  youX: number;
  height: number;
  // Where the closed row starts, and the discarded row under the done one.
  closedY: number;
};

const STEP = 80;
const TOP = 56;

// The open states in the order the work reaches them, one row each, on their turn's lane; the
// states that close as done below them, and the discarded ones in a row of their own at the bottom.
export function laneLayout(raw: RawPreset, type: string, width: number): LaneLayout {
  const workflow = workflowOf(raw, type);
  const states = Object.entries(workflow.states ?? {}).map(([name, state]) => ({
    name,
    turn: state?.turn ?? 'agent',
    ...(state?.closes === undefined ? {} : { closes: state.closes }),
  }));
  const transitions = workflow.transitions ?? [];
  const edges = transitions.flatMap((move, index) =>
    asList(move.from).map((from, at) => ({
      index,
      from,
      to: move.to ?? '',
      by: move.by ?? '',
      reason: move.reason === 'required',
      labelled: at === 0,
    })),
  );
  const names = states.map(({ name }) => name);
  const seen: string[] = [];
  const queue = [workflow.incomplete, workflow.initial].filter(
    (entry): entry is string => entry !== undefined && names.includes(entry),
  );
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.includes(next)) continue;
    seen.push(next);
    for (const edge of edges)
      if (edge.from === next && !seen.includes(edge.to)) queue.push(edge.to);
  }
  const order = [...seen, ...names.filter((name) => !seen.includes(name))];
  const byName = new Map(states.map((state) => [state.name, state]));
  const agentX = Math.round(width * 0.36);
  const youX = Math.round(width * 0.68);
  const placed: PlacedState[] = [];
  const open = order.filter((name) => byName.get(name)?.turn !== 'none');
  open.forEach((name, row) => {
    const state = byName.get(name);
    if (state)
      placed.push({ ...state, x: state.turn === 'human' ? youX : agentX, y: TOP + row * STEP });
  });
  const closedY = TOP + open.length * STEP;
  const done = order.filter((name) => byName.get(name)?.closes === 'done');
  const discarded = order.filter(
    (name) => byName.get(name)?.turn === 'none' && byName.get(name)?.closes !== 'done',
  );
  done.forEach((name, at) => {
    const state = byName.get(name);
    if (state) placed.push({ ...state, x: Math.round((agentX + youX) / 2) + at * 140, y: closedY });
  });
  const discardY = closedY + (done.length > 0 ? STEP : 0) + 24;
  const span = Math.min(150, Math.round((width - 80) / Math.max(discarded.length, 1)));
  const left = Math.round(width / 2 - (span * (discarded.length - 1)) / 2);
  discarded.forEach((name, at) => {
    const state = byName.get(name);
    if (state) placed.push({ ...state, x: left + at * span, y: discardY });
  });
  return {
    states: placed,
    moves: edges,
    agentX,
    youX,
    height: discardY + 40,
    closedY: discardY,
  };
}
