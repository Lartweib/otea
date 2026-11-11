import { activeLease } from '../active-lease.ts';
import type { FeedEvent } from '../activity.ts';
import type { Item, TypeView } from '../types.ts';

// The sections of Te toca (SPEC §6.7). Otea has no "question" or "own step" in its data, so they are
// read from what it does have: the handoff's words, who created the item, where its type starts.
export type TocaSection =
  | 'atasco'
  | 'preguntas'
  | 'revisiones'
  | 'propios'
  | 'encamino'
  | 'cerrados';

export const TOCA_SECTIONS: readonly TocaSection[] = [
  'atasco',
  'preguntas',
  'revisiones',
  'propios',
  'encamino',
  'cerrados',
];

export type TocaContext = {
  now: number;
  feed: readonly FeedEvent[];
  types: (item: Item) => TypeView | undefined;
};

// Closed work stays in Cerrados for a week.
export const CLOSED_FOR = 7 * 24 * 60 * 60_000;

// An agent's lease ran out with nobody releasing it, and nobody took the item again.
export function isStuck(item: Item, now: number): boolean {
  return item.turn === 'agent' && !!item.expiredLease && !activeLease(item.lease, now);
}

export type HandedNote = { agent: string; reason: string; at: string };

// The agent move that brought the item into its current state, and what it said (the feed is in
// id order, oldest first).
export function handedNote(item: Item, feed: readonly FeedEvent[]): HandedNote | null {
  const last = feed.findLast(
    (event) =>
      event.itemId === item.id && event.type === 'transitioned' && event.data.to === item.state,
  );
  if (last?.actor.kind !== 'agent' || typeof last.data.via === 'string') return null;
  const reason = typeof last.data.reason === 'string' ? last.data.reason : '';
  return { agent: last.actor.name, reason, at: last.at };
}

type LeaseEvent = Pick<FeedEvent, 'type' | 'actor' | 'data'>;

// After you took a stuck item in hand, of its events: the agent you left it for (Reasignar), or
// null when you put it back in the queue of its step (Retomar: any agent may take it). Undefined
// when you did neither, or an agent has claimed it or moved it since.
export function leftFor(events: readonly LeaseEvent[]): string | null | undefined {
  const last = events.findLast(
    (e) => e.type === 'claimed' || e.type === 'released' || e.type === 'transitioned',
  );
  if (last?.type !== 'released' || last.actor.kind !== 'human') return undefined;
  if (last.data.cause === 'reassign' && typeof last.data.next === 'string') return last.data.next;
  return last.data.cause === 'restart' ? null : undefined;
}

// Who has the item: the lease holder, else the one whose lease ran out, else the agent you left it
// for (Reasignar) or none (Retomar: any agent may take it) until an agent takes it or it moves,
// else the last agent that acted on it.
export function agentOf(item: Item, feed: readonly FeedEvent[]): string | null {
  if (item.lease) return item.lease.holder;
  if (item.expiredLease) return item.expiredLease.holder;
  const left = leftFor(feed.filter((e) => e.itemId === item.id));
  if (left !== undefined) return left;
  const last = feed.findLast((event) => event.itemId === item.id && event.actor.kind === 'agent');
  return last ? last.actor.name : null;
}

export function tocaSection(item: Item, ctx: TocaContext): TocaSection | null {
  if (item.turn === 'none') {
    return ctx.now - Date.parse(item.updatedAt) <= CLOSED_FOR ? 'cerrados' : null;
  }
  if (item.turn === 'agent') return isStuck(item, ctx.now) ? 'atasco' : 'encamino';
  if (handedNote(item, ctx.feed)?.reason.trim().endsWith('?')) return 'preguntas';
  const type = ctx.types(item);
  if (item.createdBy.kind === 'human' && type && item.state === type.initial) return 'propios';
  return 'revisiones';
}

// What waits for you: your turn, and what got stuck (the rail, the mark, the title).
export function tocaCount(items: readonly Item[], ctx: Pick<TocaContext, 'now'>): number {
  return items.filter((item) => item.turn === 'human' || isStuck(item, ctx.now)).length;
}

export function stuckCount(items: readonly Item[], ctx: Pick<TocaContext, 'now'>): number {
  return items.filter((item) => isStuck(item, ctx.now)).length;
}

// A board's pair in the rail: on your turn / open.
export function boardCounts(
  items: readonly Item[],
  board: string,
): { yours: number; open: number } {
  let yours = 0;
  let open = 0;
  for (const item of items) {
    if (item.collection !== board) continue;
    if (item.turn === 'human') yours++;
    if (item.turn !== 'none') open++;
  }
  return { yours, open };
}
