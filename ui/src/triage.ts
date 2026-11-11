import type { Waits } from './actions.ts';
import { moveBlock, moveVariants } from './actions.ts';
import type { FeedEvent } from './activity.ts';
import { handedNote, type TocaContext, tocaSection } from './derive/toca.ts';
import { clamp, sstep } from './motion/curves.ts';
import type { Item, Move } from './types.ts';

// Triaje (SPEC §10.4, mock:3995-4036): the reviews, one card at a time. Aprobar is the primary move,
// Devolver… sends the item back to an agent with notes, Después leaves it for the end of the pass.
// The card follows the pointer or the finger: let go past the threshold to the right it approves,
// to the left it sends back; short of it, it springs home. The buttons do the same without a drag.

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

// A pass: the cards in the order met, the one on top, and how many were decided. gone: the decided
// cards seen leaving the reviews; one that comes back (Deshacer, or a failed move) returns on top.
export type TriState = { q: string[]; i: number; decided: number; gone: string[] };
export type TriKind = 'approve' | 'send' | 'later';

export const triStart = (ids: readonly string[]): TriState => ({
  q: [...ids],
  i: 0,
  decided: 0,
  gone: [],
});
export const triCurrent = (s: TriState): string | undefined => s.q[s.i];
export const triNext = (s: TriState): string | undefined => s.q[s.i + 1];

// A decided card back on top of the pass, undecided again.
export function triReturn(s: TriState, id: string): TriState {
  const at = s.q.indexOf(id);
  if (at < 0 || at >= s.i) return s;
  const q = s.q.filter((each) => each !== id);
  q.splice(s.i - 1, 0, id);
  return { ...s, q, i: s.i - 1, decided: s.decided - 1, gone: s.gone.filter((g) => g !== id) };
}

// The reviews changed under the pass: a new one joins the end, one still to come that left the
// reviews (somebody moved it) drops out. What was already decided stays, for the count; a decided
// card seen gone that is a review again (its move taken back) returns on top. A decided card still
// listed while its move lands is not one: it never left.
export function triSync(s: TriState, waiting: readonly string[]): TriState {
  const now = new Set(waiting);
  const decided = s.q.slice(0, s.i);
  const gone = [
    ...s.gone.filter((id) => !now.has(id)),
    ...decided.filter((id) => !now.has(id) && !s.gone.includes(id)),
  ];
  const back = s.gone.filter((id) => now.has(id));
  const kept = s.q.filter((id, at) => at < s.i || now.has(id));
  const added = waiting.filter((id) => !s.q.includes(id));
  const same =
    kept.length === s.q.length &&
    added.length === 0 &&
    back.length === 0 &&
    gone.length === s.gone.length;
  if (same) return s;
  let next: TriState = { ...s, q: [...kept, ...added], gone: [...gone, ...back] };
  for (const id of back) next = triReturn(next, id);
  return next;
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

// The drag's pose. The card tilts with the pull, never past a slight 3 degrees.
export const tiltOf = (dx: number): number => clamp(dx * 0.01, -3, 3);

// Toward a side with no move the card gives only a little, like a rubber band.
export function resist(dx: number, open: boolean): number {
  return open ? dx : Math.sign(dx) * Math.min(28, Math.abs(dx) * 0.2);
}

// Where a decided card is thrown: on past where it was let go (it keeps going the way it went),
// a fixed way for a card decided by a button.
export function throwTo(side: Direction, dx: number): number {
  const d = Math.max(220, Math.abs(dx) + 140);
  return side === 'right' ? d : -d;
}

// A thrown card stays whole as it leaves, then lets go well before it lands.
export const throwFade = (k: number): number => 1 - sstep(clamp((k - 0.2) / 0.65));

// A card left for later drops behind (mock:4033).
export const LATER_POSE = 'translateY(24px) scale(0.97)';

// How far a stamp shifts along its card to stay on the screen while the card is pulled off it
// (at: the stamp's left within the card; card.left: where the card rests), never off its card.
const EDGE = 10;
const INSET = 6;
export function stampShift(
  side: Direction,
  stamp: { at: number; width: number },
  card: { left: number; width: number },
  x: number,
  view: number,
): number {
  const left = card.left + stamp.at + x;
  if (side === 'right') {
    const over = left + stamp.width - (view - EDGE);
    return over > 0 ? Math.max(-over, INSET - stamp.at) : 0;
  }
  const under = EDGE - left;
  return under > 0 ? Math.min(under, card.width - INSET - stamp.at - stamp.width) : 0;
}
