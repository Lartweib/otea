import type { Turn } from './types.ts';

// Lift, carry, set down. The list is measured before and after every change (FLIP): a row that changed
// hands is carried from its old place and lane, closing sinks it into the trunk, and the rest make room.

// Where a block of the list sat: its top inside the list, and for a row its turn and node lane.
export type Placement = { top: number; turn?: Turn; x?: number };

export type MotionKind = 'carry' | 'close' | 'reopen' | 'room' | 'enter';

// dy and fromX - toX are where the block starts, relative to where it now is.
export type Motion = {
  key: string;
  kind: MotionKind;
  dy: number;
  fromX: number;
  toX: number;
  toYou: boolean;
};

function kindOf(from: Turn, to: Turn): MotionKind {
  if (to === 'none') return 'close';
  if (from === 'none') return 'reopen';
  return 'carry';
}

export function planMotion(
  before: ReadonlyMap<string, Placement>,
  after: ReadonlyMap<string, Placement>,
): Motion[] {
  if (before.size === 0) return [];
  const plan: Motion[] = [];
  for (const [key, now] of after) {
    const toX = now.x ?? 0;
    const was = before.get(key);
    if (!was) {
      plan.push({ key, kind: 'enter', dy: 0, fromX: toX, toX, toYou: false });
      continue;
    }
    const dy = was.top - now.top;
    const fromX = was.x ?? 0;
    if (was.turn && now.turn && was.turn !== now.turn) {
      const kind = kindOf(was.turn, now.turn);
      plan.push({ key, kind, dy, fromX, toX, toYou: now.turn === 'human' });
    } else if (dy !== 0) {
      plan.push({ key, kind: 'room', dy, fromX, toX, toYou: false });
    }
  }
  return plan;
}

// One motion system: three durations and one easing, mirrored by the --m-* tokens in
// styles/tokens.css. fast: hover, press, the selection band; base: the chevron, content coming in,
// a fade, the divider going home; slow: anything else that moves layout (FLIP).
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 280,
  ease: 'cubic-bezier(0.25, 1, 0.5, 1)',
} as const;

// The turn change keeps its own family (lift, carry, set down): the carried row travels 680ms and
// the rows making room for it follow its clock.
export const TIMING = {
  travel: { duration: 680, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  room: { duration: 600, delay: 90, easing: MOTION.ease },
  ripple: { duration: 760, delay: 560, easing: MOTION.ease },
} as const;

// The tree draw, its own family: a parent's children are drawn in by the line of its branch. The
// duration grows with the rows drawn (open nested ones count) and is capped; folding is quicker. An
// elbow draws over 20px of the head's travel and its row resolves over the next 40px.
export const TREE = { base: 180, per: 70, cap: 600, fold: 0.8, elbow: 20, fade: 40 } as const;

export function treeDuration(rows: number, folding = false): number {
  const unfold = Math.min(TREE.cap, TREE.base + TREE.per * Math.max(0, rows));
  return folding ? unfold * TREE.fold : unfold;
}

// Where the line's head is (0..1 of its travel) at a point of the timeline (0..1): constant speed
// for 60% of the time, which covers 75% of the line, then it eases out.
export function headAt(time: number): number {
  const u = Math.min(1, Math.max(0, time));
  if (u < 0.6) return 1.25 * u;
  return 0.75 + 0.25 * (1 - (1 - (u - 0.6) / 0.4) ** 2);
}

// How much of a block has been revealed when the head is at a point of the branch: knots pair a
// head position with the room it opens (each row is fully open by the time the head reaches its
// elbow), straight between them.
export function roomAt(knots: readonly (readonly [number, number])[], head: number): number {
  const first = knots[0];
  const last = knots.at(-1);
  if (!first || !last) return 0;
  if (head <= first[0]) return first[1];
  for (let index = 1; index < knots.length; index++) {
    const [x1, y1] = knots[index] as readonly [number, number];
    if (head > x1) continue;
    const [x0, y0] = knots[index - 1] as readonly [number, number];
    return x1 === x0 ? y1 : y0 + ((y1 - y0) * (head - x0)) / (x1 - x0);
  }
  return last[1];
}

// The theme switch opens the new theme as a circle from a point (the toggle's centre) on the turn
// change's clock (TIMING.travel); its radius reaches the farthest corner of the viewport.
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
