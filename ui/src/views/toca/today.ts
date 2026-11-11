import type { FeedEvent } from '../../activity.ts';
import type { Item, State, TypeView } from '../../types.ts';

// What happened today, read from the feed (the dek and the agents column's colophon): what agents
// handed you, what you approved, what you sent back with notes.

export type TodayContext = {
  now: number;
  items: readonly Item[];
  types: (item: Item) => TypeView | undefined;
};

export type Today = { handed: number; approved: number; sent: number };

export function dayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// The state an event moved an item into, from its type.
export function stateLookup(ctx: Pick<TodayContext, 'items' | 'types'>) {
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  return (itemId: string, state: string): State | undefined => {
    const it = byId.get(itemId);
    return it ? ctx.types(it)?.states.find((s) => s.name === state) : undefined;
  };
}

const reasonOf = (e: FeedEvent) =>
  typeof e.data.reason === 'string' && e.data.reason.trim() !== '' ? e.data.reason : '';

export function todayCounts(feed: readonly FeedEvent[], ctx: TodayContext): Today {
  const from = dayStart(ctx.now);
  const stateOf = stateLookup(ctx);
  const out: Today = { handed: 0, approved: 0, sent: 0 };
  for (const e of feed) {
    if (e.type !== 'transitioned' || Date.parse(e.at) < from) continue;
    const to = stateOf(e.itemId, String(e.data.to));
    if (!to) continue;
    // A relayed move is the person's words, carried by an agent.
    const relayed = typeof e.data.via === 'string';
    if (e.actor.kind === 'agent' && !relayed) {
      if (to.turn === 'human') out.handed++;
      continue;
    }
    if (to.closes === 'discarded') continue;
    if (to.turn === 'agent' && reasonOf(e)) out.sent++;
    else out.approved++;
  }
  return out;
}
