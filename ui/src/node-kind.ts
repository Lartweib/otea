import type { Closing, Item, Turn, TypeView } from './types.ts';

export type NodeKind = 'you' | 'working' | 'queued' | 'incomplete' | 'done' | 'discarded';

// closes: how the item's closed state closes it, as its preset declares. Never read from the name.
export type NodeFacts = { turn: Turn; closes?: Closing; leased: boolean; incomplete: boolean };

export function nodeKind({ turn, closes, leased, incomplete }: NodeFacts): NodeKind {
  if (turn === 'human') return 'you';
  if (turn === 'none') return closes === 'discarded' ? 'discarded' : 'done';
  if (leased) return 'working';
  return incomplete ? 'incomplete' : 'queued';
}

// The node of an item: its type says which state is incomplete; the item says how it closed.
export function itemNodeKind(
  item: Pick<Item, 'turn' | 'state' | 'closes'>,
  type: TypeView | undefined,
  leased: boolean,
): NodeKind {
  const facts: NodeFacts = { turn: item.turn, leased, incomplete: item.state === type?.incomplete };
  if (item.closes !== undefined) facts.closes = item.closes;
  return nodeKind(facts);
}
