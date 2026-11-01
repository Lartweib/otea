import type { Item } from './types.ts';

// One collection in the rail: how many items wait for you, out of those still open.
export type RailEntry = { name: string; yours: number; open: number };

export function railEntries(names: readonly string[], items: readonly Item[]): RailEntry[] {
  return names.map((name) => {
    const own = items.filter((item) => item.collection === name);
    return {
      name,
      yours: own.filter((item) => item.turn === 'human').length,
      open: own.filter((item) => item.turn !== 'none').length,
    };
  });
}

export function inCollection(items: readonly Item[], collection: string | undefined): Item[] {
  return collection === undefined
    ? [...items]
    : items.filter((item) => item.collection === collection);
}
