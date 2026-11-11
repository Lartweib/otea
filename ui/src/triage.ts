import type { Waits } from './actions.ts';
import { moveBlock, moveVariants } from './actions.ts';
import type { FeedEvent } from './activity.ts';
import { handedNote, type TocaContext, tocaSection } from './derive/toca.ts';
import type { Item, Move } from './types.ts';

// Triaje (SPEC §10.4, mock:3995-4036): the reviews, one card at a time. Aprobar is the primary move,
// Devolver… sends the item back to an agent with notes, Después leaves it for the end of the pass.
// On the phone a swipe right approves and a swipe left sends back.

export type Direction = 'right' | 'left';

// forward: the primary move (the one that hands the turn on). back: the first other move that hands the
// item to an agent. Either may be missing. blocked: moves that wait for open children or blockers, shown disabled
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

export function triagePlan(moves: readonly Move[], waits?: Waits): TriagePlan {
  const blocked = moves.flatMap((move) => {
    const note = moveBlock(move, waits);
    return note === undefined ? [] : [{ move, note }];
  });
  const free = moves.filter((move) => !blocked.some((entry) => entry.move === move));
  const forward = moves[moveVariants(moves, waits).indexOf('primary')];
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

// The reviews a pass goes through: what an agent handed you to review (Te toca's Revisiones), the
// one waiting longest first.
export function triageQueue(items: readonly Item[], ctx: TocaContext): string[] {
  return items
    .filter((it) => tocaSection(it, ctx) === 'revisiones')
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .map((it) => it.id);
}

// A pass: the cards in the order met, the one on top, and how many were decided.
export type TriState = { q: string[]; i: number; decided: number };
export type TriKind = 'approve' | 'send' | 'later';

export const triStart = (ids: readonly string[]): TriState => ({ q: [...ids], i: 0, decided: 0 });
export const triCurrent = (s: TriState): string | undefined => s.q[s.i];
export const triNext = (s: TriState): string | undefined => s.q[s.i + 1];

// The reviews changed under the pass: a new one joins the end, one still to come that left the
// reviews (somebody moved it) drops out. What was already decided stays, for the count.
export function triSync(s: TriState, waiting: readonly string[]): TriState {
  const now = new Set(waiting);
  const kept = s.q.filter((id, at) => at < s.i || now.has(id));
  const added = waiting.filter((id) => !s.q.includes(id));
  if (kept.length === s.q.length && added.length === 0) return s;
  return { ...s, q: [...kept, ...added] };
}

export function triDecide(s: TriState, kind: TriKind): TriState {
  if (kind !== 'later') return { ...s, i: s.i + 1, decided: s.decided + 1 };
  const q = [...s.q];
  const [current] = q.splice(s.i, 1);
  if (current !== undefined) q.push(current);
  return { ...s, q };
}

// The round the item is in: one more for every time you sent it back with notes.
export function roundOf(id: string, feed: readonly FeedEvent[]): number {
  return (
    1 +
    feed.filter(
      (e) =>
        e.itemId === id &&
        e.type === 'transitioned' &&
        e.actor.kind === 'human' &&
        typeof e.data.reason === 'string' &&
        e.data.reason.trim() !== '',
    ).length
  );
}

// What a card says under its title: who hands it to you, in which round, and what it said.
export function cardWords(
  item: Item,
  feed: readonly FeedEvent[],
): { agent: string | null; say: string; round: number } {
  const note = handedNote(item, feed);
  return {
    agent: note?.agent ?? null,
    say: note?.reason.trim() ?? '',
    round: roundOf(item.id, feed),
  };
}

// Where a decided card flies (mock:4033): an approval to the right, a send-back to the left, both
// tilted; a card left for later drops behind.
export function exitPose(kind: TriKind): string {
  if (kind === 'later') return 'translateY(24px) scale(0.97)';
  const dx = kind === 'approve' ? 1 : -1;
  return `translateX(${dx * 120}px) rotate(${dx * 2}deg)`;
}
