import type { Item } from './types.ts';

// What the empty detail pane says under its hint, for the items in view (a collection, or the whole
// project under All items): how many wait for you and how many are with agents. A zero count is left
// out, except yours: with nothing waiting it says so, the good news.
export type Fact = { kind: 'yours' | 'agents'; count: number } | { kind: 'nothing' };

export function emptyFacts(items: readonly Pick<Item, 'turn'>[]): Fact[] {
  const yours = items.filter((item) => item.turn === 'human').length;
  const agents = items.filter((item) => item.turn === 'agent').length;
  return [
    yours > 0 ? { kind: 'yours', count: yours } : { kind: 'nothing' },
    ...(agents > 0 ? [{ kind: 'agents', count: agents } as const] : []),
  ];
}
