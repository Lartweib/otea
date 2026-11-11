import type { State, TypeView } from '../types.ts';

// A type's main path, for the route and the Pasos columns (SPEC §6.7): from where its items start,
// take the first move the preset declares to a state not visited yet that does not close as
// discarded, until a closed state. With no moves served, the states in their declared order.
export function mainPath(type: TypeView): string[] {
  const states = new Map(type.states.map((s) => [s.name, s]));
  const keeps = (s: State | undefined) => !!s && s.closes !== 'discarded';
  if (!type.transitions) {
    const path: string[] = [];
    for (const s of type.states) {
      if (!keeps(s)) continue;
      path.push(s.name);
      if (s.turn === 'none') break;
    }
    return path;
  }
  const path = [type.initial];
  let at = states.get(type.initial);
  while (at && at.turn !== 'none') {
    const from = at.name;
    const next = type.transitions.find(
      ({ from: f, to }) => f === from && !path.includes(to) && keeps(states.get(to)),
    );
    if (!next) break;
    path.push(next.to);
    at = states.get(next.to);
  }
  return path;
}

// The step of the main path a state sits at. An off-path state sits at the nearest earlier step
// with its own turn (earlier than the first step it is entered from), else at the latest step of
// the path the item visited (the first step when it visited none).
export function pathStep(type: TypeView, state: string, visited: readonly string[] = []): number {
  const path = mainPath(type);
  const own = path.indexOf(state);
  if (own >= 0) return own;
  const turn = type.states.find((s) => s.name === state)?.turn;
  const entries = (type.transitions ?? [])
    .filter(({ to }) => to === state)
    .map(({ from }) => path.indexOf(from))
    .filter((i) => i >= 0);
  const anchor = entries.length ? Math.min(...entries) : path.length - 1;
  for (let i = anchor; i >= 0; i--) {
    const step = type.states.find((s) => s.name === path[i]);
    if (step && step.turn === turn) return i;
  }
  const seen = visited.map((name) => path.indexOf(name)).filter((i) => i >= 0);
  return seen.length ? Math.max(...seen) : 0;
}
