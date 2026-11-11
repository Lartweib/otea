import { mainPath, pathStep } from '../../derive/path.ts';
import { type Lane, laneOf } from '../../lanes/geometry.ts';
import type { TypeView } from '../../types.ts';

// The route: the item's main path as the two lanes laid flat (SPEC §10.3, mock:2613-2667). Pure
// geometry; Route.tsx draws it.

// The lanes' heights in the route's 104 px: the agents' above, yours below, the trunk between.
export const RY: Record<Lane, number> = { ag: 32.5, you: 64.5, none: 48.5 };

export type RouteStep = { name: string; lane: Lane };

export type Pt = [number, number];

export type RouteGeom = {
  steps: RouteStep[];
  n: number;
  ci: number;
  xs: number[];
  pts: Pt[];
  node: Pt;
  xh: number;
  W: number;
};

// The type's main path, each step on the lane of whose turn it is.
export function routeSteps(type: TypeView): RouteStep[] {
  const turn = new Map(type.states.map((s) => [s.name, s.turn]));
  return mainPath(type).map((name) => ({ name, lane: laneOf(turn.get(name) ?? 'agent') }));
}

// The step the item's state sits at (an off-path state at the step it belongs to).
export function routeIndex(type: TypeView, state: string, visited: readonly string[]): number {
  return pathStep(type, state, visited);
}

export function routeGeom(steps: RouteStep[], ci: number, nodeLane: Lane, W: number): RouteGeom {
  const n = steps.length;
  const x0 = 44;
  const x1 = W - 31;
  const xs = steps.map((_, i) => (n > 1 ? Math.round(x0 + (i * (x1 - x0)) / (n - 1)) : x0));
  const at = Math.max(0, Math.min(ci, n - 1));
  const pts: Pt[] = [];
  for (let i = 0; i <= at; i++) {
    const lane = i === at ? nodeLane : (steps[i]?.lane ?? 'ag');
    pts.push([xs[i] ?? x0, RY[lane]]);
  }
  return {
    steps,
    n,
    ci: at,
    xs,
    pts,
    node: pts[pts.length - 1] ?? [x0, RY.ag],
    xh: xs[n - 1] ?? x0,
    W,
  };
}

// One stretch of a line from prev to p: flat, a 30 px S-curve between lanes halfway, or the fuse into
// the trunk at the last step.
export function seg(prev: Pt, p: Pt, last: boolean): string {
  if (prev[1] === p[1]) return `H${p[0]}`;
  if (last && p[1] === RY.none)
    return `H${p[0] - 68}C${p[0] - 38} ${prev[1]} ${p[0] - 30} ${p[1]} ${p[0]} ${p[1]}`;
  const m = (prev[0] + p[0]) / 2;
  return `H${m - 30}C${m - 5} ${prev[1]} ${m + 5} ${p[1]} ${m + 30} ${p[1]}H${p[0]}`;
}

export function walkedD(g: RouteGeom): string {
  const [first = [44, RY.ag] as Pt] = g.pts;
  let d = `M${first[0]} ${first[1]}`;
  for (let i = 1; i < g.pts.length; i++)
    d += seg(g.pts[i - 1] as Pt, g.pts[i] as Pt, i === g.n - 1);
  return d;
}

// The future, dashed, from the node to the end; none once the item stands at the end.
export function futureD(g: RouteGeom): string | null {
  if (g.ci >= g.n - 1) return null;
  let d = `M${g.node[0]} ${g.node[1]}`;
  let prev = g.node;
  for (let i = g.ci + 1; i < g.n; i++) {
    const p: Pt = [g.xs[i] ?? 0, RY[g.steps[i]?.lane ?? 'ag']];
    d += seg(prev, p, i === g.n - 1);
    prev = p;
  }
  return d;
}

// A lane laid flat from its name to the trunk.
export const laneD = (xh: number, y: number): string =>
  `M24 ${y}H${xh - 68}C${xh - 38} ${y} ${xh - 30} ${RY.none} ${xh} ${RY.none}`;

export const trunkD = (xh: number, W: number): string => `M${xh} ${RY.none}H${W}`;

// A round you sent back, at the step it was sent back from.
export type DipSpec = { at: number; label: string };
export type Dip = { x: number; d: string; label?: string };

// Each round you sent back dips under your lane before its step; a second at the same step sits 40
// px further back, and only the first carries the label.
export function dipsOf(g: RouteGeom, dips: readonly DipSpec[]): Dip[] {
  const count = new Map<number, number>();
  const out: Dip[] = [];
  for (const dp of dips) {
    if (dp.at < 0 || dp.at >= g.n) continue;
    const k = (count.get(dp.at) ?? 0) + 1;
    count.set(dp.at, k);
    const x = (g.xs[dp.at] ?? 0) - 50 - (k - 1) * 40;
    const y = RY.you;
    out.push({
      x,
      d: `M${x - 14} ${y}C${x - 14} 84 ${x + 14} 84 ${x + 14} ${y}`,
      ...(k === 1 ? { label: dp.label } : {}),
    });
  }
  return out;
}
