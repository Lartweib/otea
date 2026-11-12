import { backWaysOf, waysOf } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  type Doer,
  guardedBranch,
  type Step,
} from '../../../../src/core/board/model.ts';
import type { Lane } from '../../lanes/geometry.ts';
import type { Look } from '../../lanes/looks.ts';

// Where the editor draws a board: its steps laid flat on the two lanes (agents above, you below),
// fusing into Hecho on the right; and, under 760 px, the same stops as rows on the vertical lanes.
// Pure numbers, so the drawing and its tests agree (mock 60-route.js: geom, seg, pointsOf).

export const RY = { ag: 46, you: 86, mid: 66 } as const;

// A review: a visit to the reviewer's lane (or a mark on the same lane) after the step's stop.
export type ReviewSpot = { x: number; y: number; same: boolean; you: boolean };

export type Stop =
  | { key: 'form'; kind: 'form'; x: number; y: number; rv: null }
  | {
      key: string;
      kind: 'step';
      x: number;
      y: number;
      step: Step;
      index: number;
      rv: ReviewSpot | null;
    }
  | { key: 'done'; kind: 'done'; x: number; y: number; rv: null };

export type Geom = { stops: Stop[]; xd: number; col: number; x0: number; W: number };

export const laneY = (who: Doer | 'you' | 'agent') => (who === 'you' ? RY.you : RY.ag);

export function geom(def: BoardDefinition, W: number, { x0 = 64, pad = 34 } = {}): Geom {
  const n = def.steps.length;
  const xd = W - pad;
  const col = (xd - x0) / (n + 1);
  const stops: Stop[] = [{ key: 'form', kind: 'form', x: x0, y: RY.mid, rv: null }];
  def.steps.forEach((step, index) => {
    const x = Math.round(x0 + col * (index + 1));
    const y = laneY(step.doer);
    let rv: ReviewSpot | null = null;
    if (step.reviewer !== 'none') {
      const ry = laneY(step.reviewer === 'you' ? 'you' : 'agent');
      rv = { x: Math.round(x + col * 0.42), y: ry, same: ry === y, you: step.reviewer === 'you' };
    }
    stops.push({ key: step.id, kind: 'step', x, y, step, index, rv });
  });
  stops.push({ key: 'done', kind: 'done', x: xd, y: RY.mid, rv: null });
  return { stops, xd, col, x0, W };
}

type Pt = readonly [number, number];

// A run from one point to the next: straight on a lane, an S-bend across lanes.
export function seg(prev: Pt, p: Pt): string {
  if (Math.abs(prev[1] - p[1]) < 0.5) return `H${p[0]}`;
  const dx = p[0] - prev[0];
  const m = (prev[0] + p[0]) / 2;
  const w = Math.min(30, dx / 2 - 2);
  return `H${m - w}C${m - w / 4} ${prev[1]} ${m + w / 4} ${p[1]} ${m + w} ${p[1]}H${p[0]}`;
}

export function pathOf(pts: readonly Pt[]): string {
  const [first, ...rest] = pts;
  if (!first) return '';
  let d = `M${first[0]} ${first[1]}`;
  let prev = first;
  for (const p of rest) {
    d += seg(prev, p);
    prev = p;
  }
  return d;
}

// Every point an item passes: each stop, and the visit to the other lane when it is reviewed there.
export function pointsOf(g: Geom): Pt[] {
  const pts: Pt[] = [];
  for (const st of g.stops) {
    pts.push([st.x, st.y]);
    if (st.rv && !st.rv.same) pts.push([st.rv.x, st.rv.y]);
  }
  return pts;
}

// The lanes themselves: each runs to the right and bends into the trunk at Hecho.
export function lanePaths(g: Geom): { ag: string; you: string; trunk: string } {
  const { xd } = g;
  const lane = (y: number) =>
    `M24 ${y}H${xd - 68}C${xd - 38} ${y} ${xd - 30} ${RY.mid} ${xd} ${RY.mid}`;
  return { ag: lane(RY.ag), you: lane(RY.you), trunk: `M${xd} ${RY.mid}H${g.W}` };
}

// The other ways out of each step: dashed arcs over the agents' lane, from the step (or its review
// on the other lane) to the stop it lands on, each with a small "o".
export type Arc = { from: string; to: string; d: string; label: { x: number; y: number } };

export function wayArcs(def: BoardDefinition, g: Geom): Arc[] {
  const out: Arc[] = [];
  for (const st of g.stops) {
    if (st.kind !== 'step') continue;
    const from = st.rv && !st.rv.same ? st.rv : st;
    waysOf(def, st.key)
      .slice(1)
      .forEach((target, k) => {
        const to = g.stops.find((s) => s.key === target);
        if (!to) return;
        const top = 16 + k * 7;
        out.push({
          from: st.key,
          to: target,
          d: `M${from.x} ${from.y}C${from.x + 10} ${top} ${to.x - 16} ${top} ${to.x} ${to.y - 6}`,
          label: { x: (from.x + to.x) / 2, y: top + 4 },
        });
      });
  }
  return out;
}

// The selected step's send-back: a dashed loop under your lane from its review back to the step it
// lands on. Only for a review by you.
export function backLoop(
  g: Geom,
  stepId: string,
): { d: string; label: { x: number; y: number; right: number } } | null {
  const st = g.stops.find((s) => s.key === stepId);
  if (st?.kind !== 'step' || !st.rv?.you) return null;
  const back = st.step.back === 'same' ? st : (g.stops.find((s) => s.key === st.step.back) ?? st);
  const fx = st.rv.x;
  const bx = back.x;
  const yb = RY.you + 26;
  const mid = bx + (fx - bx) * 0.5;
  const land = back.y + (back.y === RY.you ? 0 : 6);
  return {
    d: `M${fx} ${RY.you}C${fx} ${yb} ${mid + 10} ${yb} ${mid} ${yb}S${bx} ${yb} ${bx} ${land}`,
    label: { x: (fx + bx) / 2, y: yb + 15, right: Math.max(fx, bx) },
  };
}

// Where a `+` sits between two stops: on the middle line, halfway from the stop (or its review on
// the other lane) to the next. `at` is the index a new step takes.
export function plusSpots(g: Geom): { at: number; x: number; y: number }[] {
  return g.stops.slice(0, -1).map((st, i) => {
    const next = g.stops[i + 1] as Stop;
    const fromX = st.rv && !st.rv.same ? st.rv.x : st.x;
    return { at: i, x: (fromX + next.x) / 2, y: RY.mid };
  });
}

// Where a stop's label sits: centred on it, but the first starts at it and the last ends at it.
export function labelSpot(g: Geom, i: number): { x: number; pos: 'first' | 'last' | 'mid' } {
  const st = g.stops[i] as Stop;
  if (i === 0) return { x: st.x - 14, pos: 'first' };
  if (i === g.stops.length - 1) return { x: st.x + 6, pos: 'last' };
  return { x: st.x, pos: 'mid' };
}

// The vertical route: one row per stop, on the lane of whoever does it, Hecho on the trunk.
export type VRow = { key: string; lane: Lane; look: Look };

export function vrouteRows(def: BoardDefinition): VRow[] {
  return [
    { key: 'form', lane: 'ag', look: 'waiting' },
    ...def.steps.map(
      (s): VRow =>
        s.doer === 'you'
          ? { key: s.id, lane: 'you', look: 'yours' }
          : { key: s.id, lane: 'ag', look: 'queued' },
    ),
    { key: 'done', lane: 'none', look: 'done' },
  ];
}

// ---- the marks of ways back, the skip on creation, waits and the protected branch ----

// A way back ("o regresarlo a…"): a dashed loop on the doer's lane, from the step back to the
// earlier one, with a small arrowhead where it lands. Below your lane, above the agents'. `you`:
// on your lane; the doer's word ("si lo devuelves" / "si lo regresa") follows the step's doer.
export type BackArc = {
  from: string;
  to: string;
  you: boolean;
  doerYou: boolean;
  d: string;
  head: string;
  label: { x: number; y: number };
};

export function backArcs(def: BoardDefinition, g: Geom): BackArc[] {
  const out: BackArc[] = [];
  for (const st of g.stops) {
    if (st.kind !== 'step') continue;
    backWaysOf(def, st.key).forEach((target, k) => {
      const t = g.stops.find((s) => s.key === target);
      if (!t) return;
      const you = st.y === RY.you;
      const yb = you ? RY.you + 24 + k * 8 : RY.ag - 22 - k * 8;
      const ty = t.y + (you ? 6 : -6);
      out.push({
        from: st.key,
        to: target,
        you,
        doerYou: st.step.doer === 'you',
        d: `M${st.x - 3} ${st.y + (you ? 6 : -6)}C${st.x - 8} ${yb} ${t.x + 14} ${yb} ${t.x + 3} ${ty}`,
        head: `M${t.x + 0.5} ${ty + (you ? 4 : -4)}l2.6 ${you ? -4.2 : 4.2}l3.4 1.6`,
        label: { x: (st.x + t.x) / 2, y: you ? yb + 13 : yb - 4 },
      });
    });
  }
  return out;
}

// The skip on creation: a short dashed bypass above the agents' lane, from the start dot past the
// first step to the second, with an arrowhead, clear of every way back.
export function skipBypass(
  def: BoardDefinition,
  g: Geom,
): { d: string; head: string; label: { x: number; y: number } } | null {
  const [first, second] = def.steps;
  const [a, b, c] = g.stops;
  if (!first?.skipWhenReady || !second || !a || !b || !c) return null;
  const yb = RY.ag - 19;
  const ex = c.x - 4;
  const ey = c.y - 7;
  return {
    d: `M${a.x + 4} ${a.y - 4}C${a.x + 14} ${yb} ${a.x + 30} ${yb} ${a.x + 48} ${yb}L${ex - 44} ${yb}C${ex - 16} ${yb} ${ex - 2} ${yb + 6} ${ex} ${ey}`,
    head: `M${ex - 3.4} ${ey - 4.4}l3.4 4.4l3.2-4.6`,
    label: { x: b.x, y: yb - 5 },
  };
}

// A step that waits for something: a small hourglass under its node (over it on your lane).
export function waitMarks(g: Geom): { key: string; x: number; y: number }[] {
  return g.stops.flatMap((st) =>
    st.kind === 'step' && st.step.waits.length
      ? [{ key: st.key, x: st.x, y: st.y === RY.you ? st.y - 20 : st.y + 20 }]
      : [],
  );
}

// A protected branch: a branch glyph by each step it is pushed in, and by Hecho (merged there).
export function branchMarks(
  def: BoardDefinition,
  g: Geom,
): { key: string; x: number; y: number }[] {
  const branch = guardedBranch(def);
  if (!branch) return [];
  const out = g.stops.flatMap((st) =>
    st.kind === 'step' && branch.guard.push.includes(st.key)
      ? [{ key: st.key, x: st.x + 12, y: st.y - 13 }]
      : [],
  );
  out.push({ key: 'done', x: g.xd + 12, y: RY.mid - 13 });
  return out;
}
