import type { FeedEvent } from '../../activity.ts';
import { mainPath } from '../../derive/path.ts';
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
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  const paths = new Map<TypeView, string[]>();
  const pathOf = (itemId: string) => {
    const it = byId.get(itemId);
    const type = it ? ctx.types(it) : undefined;
    if (!type) return [];
    if (!paths.has(type)) paths.set(type, mainPath(type));
    return paths.get(type) ?? [];
  };
  // A move of yours to an agent's step is a send-back when it goes back along the main path, words
  // or not (a send-back with review comments only has no reason; an approval may carry a note).
  // Off the main path, the reason the move asks for still tells.
  const sentBack = (e: FeedEvent) => {
    const path = pathOf(e.itemId);
    const from = path.indexOf(String(e.data.from));
    const to = path.indexOf(String(e.data.to));
    return from >= 0 && to >= 0 ? to <= from : !!reasonOf(e);
  };
  const out: Today = { handed: 0, approved: 0, sent: 0 };
  for (const e of feed) {
    if (e.type !== 'transitioned' || Date.parse(e.at) < from) continue;
    // Otea reading an item onto its board is nobody's approval or send-back.
    if (e.data.reason === 'migrate') continue;
    // Nor is publishing a board: the items it moves to their new steps, and the Pedido it closes.
    if (e.data.reason === 'publish' || typeof e.data.published_board === 'string') continue;
    const to = stateOf(e.itemId, String(e.data.to));
    if (!to) continue;
    // A relayed move is the person's words, carried by an agent.
    const relayed = typeof e.data.via === 'string';
    if (e.actor.kind === 'agent' && !relayed) {
      if (to.turn === 'human') out.handed++;
      continue;
    }
    if (to.closes === 'discarded') continue;
    if (to.turn === 'agent' && sentBack(e)) out.sent++;
    else out.approved++;
  }
  return out;
}
