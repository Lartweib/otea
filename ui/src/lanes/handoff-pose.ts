import { clamp, F, lerp, sstep } from '../motion/curves.ts';
import { Tt } from '../motion/time.ts';
import type { HandoffStyle } from './handoff-style.ts';

// Every frame of the handoff as a pure function of its time (port of the frame body of
// transition(), mock:2152-2251). The engine writes what these return; nothing here touches the DOM.

// Plegar folds the row into a line (FOLD) before it travels and unfolds it after (UNFOLD).
export const FOLD = 420;
export const UNFOLD = 460;

export type Clock = { T: number; FA: number; Cc: number; total: number };

// The travel takes the time of the longest carry (480 with nothing carried); Plegar adds the fold
// before it and the unfold after.
export function handoffClock(dys: readonly number[], style: HandoffStyle): Clock {
  const T = dys.length ? Math.max(...dys.map((d) => Tt.travel(d))) : 480;
  const fold = dys.length > 0 && style === 'plegar';
  const FA = fold ? FOLD : 0;
  const Cc = fold ? UNFOLD : 0;
  return { T, FA, Cc, total: FA + T + Cc };
}

// The travel's progress (p, on settle) and the rooms' (pr, 40 ms behind), at time t.
export function progressAt(t: number, FA: number, T: number) {
  const tb = t - FA;
  const s = clamp(tb / T);
  return { tb, s, p: F.settle(s), pr: F.settle(clamp((tb - 40) / T)) };
}

// A carried row's geometry: dy0/dy1 its offsets from its layout top at the start and the end, xa/xb
// its node's lane x at both ends, xc the x it is drawn at, h the lift's height, w the row's width,
// off its node's y inside the row, ct its layout top. folded: a handoff that took it over found it
// already folded (Plegar).
export type CarryGeom = {
  dy0: number;
  dy1: number;
  xa: number;
  xb: number;
  xc: number;
  h: number;
  w: number;
  off: number;
  ct: number;
  preVirtual: boolean;
  postVirtual: boolean;
  arrive: boolean;
  folded?: boolean;
};

export type Pose = {
  // The row's translateY.
  y: number;
  // The lift: its opacity, and its clip from the top and the bottom (Plegar).
  lift: { opacity: number; clip?: [number, number] };
  // The node's translateX from where it is drawn, its scale and opacity (Deslizar).
  nodeDx: number;
  nodeScale: number;
  nodeOpacity: number;
  // How much of the new look shows over the old one, and whether its check or slash draws now.
  newLook: number;
  mark: boolean;
  // The pulse's colour, from the old look's (0) to the new one's (1).
  mix: number;
  // The fold line (Plegar): its left, top, width and opacity.
  line: { x: number; y: number; w: number; o: number };
  // The pulse: its translate, scale and opacity.
  pulse: { x: number; y: number; s: number; o: number };
  // The trail's length behind the pulse, and where the pulse is.
  trail: number;
  nx: number;
  ny: number;
  // The raised plate under a row in flight (Deslizar).
  plate: number;
  // Time for the breath on the destination lane.
  breath: boolean;
};

const nodeX = (p: number, g: CarryGeom) => lerp(g.xa, g.xb, sstep(clamp((p - 0.12) / 0.6)));

export function plegarPose(t: number, T: number, g: CarryGeom): Pose {
  const FA = FOLD;
  const { p } = progressAt(t, FA, T);
  const inA = t < FA;
  const inC = t >= FA + T;
  const fa = g.folded ? 1 : F.glide(clamp(t / 260));
  const sh = F.ink(clamp((t - 240) / 180));
  const ga = F.ink(clamp((t - FA - T) / 200));
  const un = F.settle(clamp((t - FA - T - 120) / 340));
  const y = lerp(g.dy0, g.dy1, p);
  const k = inC ? 1 - un : inA ? fa : 1;
  const hide = (g.preVirtual && !inC) || (g.postVirtual && inC);
  const nx = nodeX(p, g);
  const ny = g.ct + g.off + y;
  const mx = sstep(clamp((p - 0.3) / 0.4));
  const span = Math.max(0, g.w - nx - 16);
  let lw = 0;
  let lo = 0;
  if (inA && !g.preVirtual && !g.folded) {
    lw = span * (1 - sh);
    lo = sstep(clamp((t - 110) / 150));
  } else if (inC && !g.postVirtual) {
    lw = span * ga;
    lo = 1 - sstep(clamp((un - 0.55) / 0.45));
  }
  const lit = inA && !g.folded ? sstep(clamp((t - (g.preVirtual ? 0 : 300)) / 120)) : 1;
  const land = inC ? sstep(clamp((t - FA - T) / 220)) : 0;
  return {
    y,
    lift: {
      opacity: hide || k > 0.995 ? 0 : 1,
      clip: [g.off * k, Math.max(0, g.h - g.off) * k],
    },
    nodeDx: nx - g.xc,
    nodeScale: 1,
    nodeOpacity: 1,
    newLook: inC ? 1 : 0,
    mark: un > 0.4,
    mix: inA ? 0 : inC ? 1 : mx,
    line: { x: nx, y: ny - 0.75, w: lw, o: lo },
    pulse: { x: nx - 3, y: ny - 3, s: 1 + 1.8 * land, o: lit * (1 - land) },
    trail: inA || inC ? 0 : 46 * Math.sin(Math.PI * p),
    nx,
    ny,
    plate: 0,
    breath: t > FA + T * 0.92,
  };
}

export function deslizarPose(t: number, T: number, g: CarryGeom): Pose {
  const { s, p } = progressAt(t, 0, T);
  const b = Math.sin(Math.PI * p);
  const y = lerp(g.dy0, g.dy1, p) - 5 * b;
  let opacity = 1;
  if (g.preVirtual && !g.arrive) opacity = sstep(clamp(p / 0.45));
  if (g.arrive) opacity = sstep(clamp((p - 0.05) / 0.4));
  if (g.postVirtual) opacity = 1 - sstep(clamp((p - 0.55) / 0.45));
  const nx = nodeX(p, g);
  const ny = g.ct + g.off + y;
  const mx = sstep(clamp((p - 0.3) / 0.4));
  const land = sstep(clamp((p - 0.8) / 0.2));
  const lit = sstep(clamp(p / 0.08));
  const show = Math.max(1 - sstep(clamp(p / 0.06)), sstep(clamp((p - 0.82) / 0.18)));
  return {
    y,
    lift: { opacity },
    nodeDx: nx - g.xc,
    nodeScale: p > 0.5 ? 0.55 + 0.45 * show : 1,
    nodeOpacity: show,
    newLook: mx,
    mark: p > 0.75,
    mix: mx,
    line: { x: nx, y: ny - 0.75, w: 0, o: 0 },
    pulse: { x: nx - 3, y: ny - 3, s: 1 + 1.8 * land, o: lit * (1 - land) },
    trail: 46 * b * (1 - land),
    nx,
    ny,
    plate: g.arrive ? 0 : b,
    breath: s > 0.8,
  };
}
