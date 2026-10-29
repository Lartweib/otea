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

// Mirrors the motion tokens in styles/tokens.css, for animations started from script.
export const TIMING = {
  travel: { duration: 680, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  arrive: { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  room: { duration: 600, delay: 90, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  ripple: { duration: 760, delay: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
} as const;
