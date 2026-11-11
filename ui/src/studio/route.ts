import { mainPath } from '../derive/path.ts';
import { stateWord } from '../preset-words.ts';
import type { TypeView } from '../types.ts';

// A template's way of working at a glance: its main path on the two lanes laid flat, the grammar
// of the item's route (mock:2613-2667) at the size of a row. The agents' lane above, yours below,
// both fusing into the closed trunk at the last step; one walked line through every step.

export type RouteLane = 'ag' | 'you' | 'none';
export type RouteStep = { name: string; label: string; lane: RouteLane };

// The lanes' heights in the drawing, and where the step names sit above them.
export const RY: Record<RouteLane, number> = { ag: 24.5, you: 44.5, none: 34.5 };
export const ROUTE_H = 54;
const X0 = 30;
const PAD = 8;
const LANE_X = 18;

const laneOfTurn = (turn: string | undefined): RouteLane =>
  turn === 'human' ? 'you' : turn === 'none' ? 'none' : 'ag';

// The steps of a type's main path, each on the lane of whose turn it is.
export function routeSteps(type: TypeView): RouteStep[] {
  return mainPath(type).map((name) => ({
    name,
    label: stateWord(type, name),
    lane: laneOfTurn(type.states.find((state) => state.name === name)?.turn),
  }));
}

export type Route = {
  xs: number[];
  stops: Array<[number, number]>;
  walked: string;
  ag: string;
  you: string;
  trunk: string;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function routeOf(steps: readonly RouteStep[], W: number): Route {
  const n = steps.length;
  const x1 = W - PAD;
  const xs = steps.map((_, i) => (n < 2 ? X0 : Math.round(X0 + (i * (x1 - X0)) / (n - 1))));
  const stops = steps.map((step, i) => [xs[i] ?? X0, RY[step.lane]] as [number, number]);
  // The S between two lanes is as wide as the room between two steps allows, 60 px at most.
  const gap = n < 2 ? 60 : (xs[1] ?? X0) - X0;
  const h = Math.max(6, Math.min(30, gap / 2 - 4));
  const k = h / 30;
  const into = (x: number, from: number, to: number) =>
    `H${r1(x - 68 * k)}C${r1(x - 38 * k)} ${from} ${r1(x - 30 * k)} ${to} ${x} ${to}`;
  let walked = `M${stops[0]?.[0] ?? X0} ${stops[0]?.[1] ?? RY.ag}`;
  for (let i = 1; i < n; i++) {
    const [px, py] = stops[i - 1] as [number, number];
    const [x, y] = stops[i] as [number, number];
    if (py === y) walked += `H${x}`;
    else if (i === n - 1 && y === RY.none) walked += into(x, py, y);
    else {
      const m = (px + x) / 2;
      walked += `H${r1(m - h)}C${r1(m - 5 * k)} ${py} ${r1(m + 5 * k)} ${y} ${r1(m + h)} ${y}H${x}`;
    }
  }
  const closes = steps[n - 1]?.lane === 'none' && n > 1;
  const xh = xs[n - 1] ?? X0;
  return {
    xs,
    stops,
    walked,
    ag: closes ? `M${LANE_X} ${RY.ag}${into(xh, RY.ag, RY.none)}` : `M${LANE_X} ${RY.ag}H${W}`,
    you: closes ? `M${LANE_X} ${RY.you}${into(xh, RY.you, RY.none)}` : `M${LANE_X} ${RY.you}H${W}`,
    trunk: closes ? `M${xh} ${RY.none}H${W}` : '',
  };
}

// Which step names show over a route: the first, yours, the last, then the rest, each only where
// it would not touch a name already kept. The names are caps at 8.5 px, about 6.2 px a letter.
export function namedSteps(
  xs: readonly number[],
  labels: readonly string[],
  yours: readonly boolean[] = [],
): boolean[] {
  const n = xs.length;
  const last = n - 1;
  const span = (i: number): [number, number] => {
    const w = (labels[i] ?? '').length * 6.2;
    const x = xs[i] ?? 0;
    if (i === 0) return [LANE_X, LANE_X + w];
    if (i === last) return [x + 4 - w, x + 4];
    return [x - w / 2, x + w / 2];
  };
  const order = [
    0,
    ...xs.map((_, i) => i).filter((i) => i > 0 && i < last && yours[i]),
    ...(last > 0 ? [last] : []),
    ...xs.map((_, i) => i).filter((i) => i > 0 && i < last && !yours[i]),
  ];
  const kept: Array<[number, number]> = [];
  const shown = xs.map(() => false);
  for (const i of order) {
    const [a, b] = span(i);
    if (kept.every(([c, d]) => a >= d + 4 || b <= c - 4)) {
      kept.push([a, b]);
      shown[i] = true;
    }
  }
  return shown;
}
