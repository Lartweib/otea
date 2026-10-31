import { moveBlock, moveVariants } from './actions.ts';
import type { ChildrenSummary, Move } from './types.ts';

// Swipe triage: one card per item on your turn. Right is the primary move, left sends the item back.

export type Direction = 'right' | 'left';

// forward: the primary move (the one that hands the turn on). back: the first other move that hands the
// item to an agent. Either may be missing. blocked: moves that wait for open children, shown disabled
// with why, never swiped.
export type TriagePlan = {
  forward?: Move;
  back?: Move;
  blocked?: Array<{ move: Move; note: string }>;
};

export type SwipeAction =
  | { kind: 'move'; to: string }
  | { kind: 'explain'; to: string }
  | { kind: 'none' };

export function triagePlan(
  moves: readonly Move[],
  children?: ChildrenSummary | undefined,
): TriagePlan {
  const blocked = moves.flatMap((move) => {
    const note = moveBlock(move, children);
    return note === undefined ? [] : [{ move, note }];
  });
  const free = moves.filter((move) => !blocked.some((entry) => entry.move === move));
  const forward = moves[moveVariants(moves, children).indexOf('primary')];
  const back = free.find((move) => move !== forward && move.turn === 'agent');
  return {
    ...(forward ? { forward } : {}),
    ...(back ? { back } : {}),
    ...(blocked.length > 0 ? { blocked } : {}),
  };
}

// A move that requires a reason is never performed by a gesture: it opens the reason form.
export function swipeAction(direction: Direction, plan: TriagePlan): SwipeAction {
  const move = direction === 'right' ? plan.forward : plan.back;
  if (!move) return { kind: 'none' };
  return { kind: move.reasonRequired ? 'explain' : 'move', to: move.to };
}

// How far a pointer travels before it counts as a drag or a scroll.
export const SLOP = 10;
// Pixels per millisecond: a release this fast commits a shorter drag.
const FLICK_SPEED = 0.5;
const FLICK_DISTANCE = 40;

export function dragIntent(dx: number, dy: number): 'pending' | 'drag' | 'scroll' {
  if (Math.hypot(dx, dy) < SLOP) return 'pending';
  return Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll';
}

export function swipeThreshold(width: number): number {
  return Math.min(160, Math.max(80, Math.round(width * 0.3)));
}

const sideOf = (dx: number): Direction => (dx > 0 ? 'right' : 'left');

// Where a released card goes: off to one side, or (undefined) back to the middle.
export function releaseDirection({
  dx,
  vx,
  width,
}: {
  dx: number;
  vx: number;
  width: number;
}): Direction | undefined {
  if (Math.abs(dx) >= swipeThreshold(width)) return sideOf(dx);
  const flick = Math.abs(vx) >= FLICK_SPEED && Math.abs(dx) >= FLICK_DISTANCE;
  if (flick && Math.sign(vx) === Math.sign(dx)) return sideOf(dx);
  return undefined;
}

export function dragProgress(dx: number, width: number): number {
  return Math.min(1, Math.abs(dx) / swipeThreshold(width));
}

// The cards still to show: what waits for you, in list order, minus what was decided or skipped here.
export function queueOf(waiting: readonly string[], seen: ReadonlySet<string>): string[] {
  return waiting.filter((id) => !seen.has(id));
}

// A box on screen (getBoundingClientRect).
export type Box = { left: number; top: number; width: number; height: number };

// How a decided card lands in its tray entry: moved onto the slot's corner and scaled to its width,
// its overflow cut from the bottom so what is left has the slot's height. dx and dy move the card's
// top-left corner; cut is in the card's own (unscaled) pixels.
export type Landing = { dx: number; dy: number; scale: number; cut: number };

export function landingOf(card: Box, slot: Box): Landing {
  const scale = card.width > 0 ? slot.width / card.width : 1;
  return {
    dx: slot.left - card.left,
    dy: slot.top - card.top,
    scale,
    cut: Math.max(0, card.height - slot.height / scale),
  };
}
