// The list-grid morph: switching views is the same items rearranging, not a page swap. One clock,
// u from 0 (list) to 1 (grid), drives every piece, so switching back midway only turns the clock
// around. Its own family in the motion system, like the tree draw:
//  · shared pieces (node, title, id, state, who, age, group label and count) are carried from
//    their list place to their grid cell over the first 72% of the clock, on the carry curve of the
//    turn change; every row on the same curve at the same moment, so rows never overlap;
//  · what only the grid has resolves in from 42%, left to right (+16% across) and down the
//    viewport (+8% at most), 26% each, out-cubic: opacity, a 6px slide and a 1.5px blur clearing;
//  · what only the list has dissolves over the first 22% (+6% across), so going back it resolves
//    last.
export const MORPH = {
  duration: 480,
  travel: 0.72,
  resolveFrom: 0.42,
  resolveAcross: 0.16,
  resolveDown: 0.08,
  resolveFor: 0.26,
  dissolveAcross: 0.06,
  dissolveFor: 0.22,
  // Only what is in view, or this close to it, moves; the rest snaps at the midpoint.
  near: 160,
  // A frame that comes late moves the clock this far at most.
  frame: 34,
  slide: 6,
  blur: 1.5,
} as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// A CSS cubic-bezier as a function of progress, solved for x by bisection.
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (p1: number, p2: number, t: number) =>
    3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let step = 0; step < 32; step++) {
      t = (lo + hi) / 2;
      if (at(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return at(y1, y2, t);
  };
}

// The turn change's carry curve (TIMING.travel), symmetric so a reversal retraces the same path.
const carry = cubicBezier(0.65, 0, 0.35, 1);
const outCubic = (x: number) => 1 - (1 - x) ** 3;

export function travelAt(u: number): number {
  return carry(clamp01(u / MORPH.travel));
}

// across: the piece's left edge over the pane's width; down: its row's share of the stagger.
export function resolveAt(u: number, across: number, down: number): number {
  const start = MORPH.resolveFrom + MORPH.resolveAcross * across + down;
  return outCubic(clamp01((u - start) / MORPH.resolveFor));
}

export function dissolveAt(u: number, across: number, down: number): number {
  const start = MORPH.dissolveAcross * across + down / 2;
  return 1 - outCubic(clamp01((u - start) / MORPH.dissolveFor));
}

export function rowStagger(top: number, viewTop: number, viewHeight: number): number {
  return MORPH.resolveDown * clamp01((top - viewTop) / Math.max(1, viewHeight));
}

// One step of the clock: dt ms in direction dir, a late frame capped so it never jumps.
export function stepClock(u: number, dir: 1 | -1, dt: number, duration: number): number {
  return clamp01(u + (dir * Math.min(dt, MORPH.frame)) / duration);
}

const NUMBER = /-?\d+(?:\.\d+)?/g;

// The lanes of both views are drawn by layoutLanes, so their paths share their commands: the
// overlay that stands in for them while the morph runs blends them number by number.
export function lerpPath(from: string, to: string, t: number): string {
  const a = from.match(NUMBER) ?? [];
  const b = to.match(NUMBER) ?? [];
  if (a.length !== b.length || from.replace(NUMBER, '#') !== to.replace(NUMBER, '#')) return to;
  let index = 0;
  return to.replace(NUMBER, () => {
    const value = lerp(Number(a[index]), Number(b[index]), t);
    index += 1;
    return String(Math.round(value * 100) / 100);
  });
}
