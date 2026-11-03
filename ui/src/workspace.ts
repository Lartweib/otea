import { collectionIcon, iconBadges } from './place-icons.ts';
import type { CollectionView, Item } from './types.ts';

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

// The sidebar's collections: their counts, their icons, and a letter on any that repeats an
// earlier one's icon.
export function sidebarEntries(
  names: readonly string[],
  items: readonly Item[],
  collectionOf: (name: string) => CollectionView | undefined,
): (RailEntry & { icon: string | undefined; badge?: string })[] {
  const withIcons = railEntries(names, items).map((entry) => ({
    ...entry,
    icon: collectionIcon(collectionOf(entry.name)),
  }));
  const badges = iconBadges(withIcons);
  return withIcons.map((entry) => {
    const badge = badges.get(entry.name);
    return badge === undefined ? entry : { ...entry, badge };
  });
}

export function inCollection(items: readonly Item[], collection: string | undefined): Item[] {
  return collection === undefined
    ? [...items]
    : items.filter((item) => item.collection === collection);
}
