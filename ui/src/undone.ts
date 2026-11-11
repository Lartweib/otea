import type { ItemEvent } from './types.ts';

// A move the person took back while its toast was up leaves two events: the move and its undo
// (which names it). Readers drop both, as if the move never happened.
export function dropUndone<E extends Pick<ItemEvent, 'id' | 'data'>>(events: readonly E[]): E[] {
  const gone = new Set<number>();
  for (const e of events) if (typeof e.data.undoes === 'number') gone.add(e.data.undoes).add(e.id);
  return gone.size === 0 ? (events as E[]) : events.filter((e) => !gone.has(e.id));
}
