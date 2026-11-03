import type { CollectionView } from './types.ts';

// Every project and every collection shows an icon, so the folded sidebar never has a gap: a
// collection draws the icon the server resolved for it, a project without one draws a monogram.

// A project's monogram: the initials of a name of two words or more, else its first two letters
// (an O alone would read as a ring, a node). Never round, never blue: a project is a place.
export function monogramOf(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const [first = '', second] = words;
  if (second !== undefined) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  return first.charAt(0).toUpperCase() + first.charAt(1).toLowerCase();
}

// The icon a collection shows. The server resolves it (`icon`); until every server does, a payload
// without the field falls back to the first icon its preset's types give.
export function collectionIcon(collection: CollectionView | undefined): string | undefined {
  if (!collection) return undefined;
  if (collection.icon !== undefined) return collection.icon ?? undefined;
  return legacyTypeIcon(collection);
}

// The fallback for servers that do not send `icon` yet: drop it once they all do.
function legacyTypeIcon(collection: CollectionView): string | undefined {
  return collection.types.find((type) => type.icon !== undefined)?.icon;
}

// When two collections share an icon, the second (and any later one) carries one small letter: the
// first letter of its name that the earlier one does not have at the same place (bugs-mobile next to
// bugs: m), else its own first letter. The first keeps its icon bare.
export function iconBadges(
  entries: readonly { name: string; icon: string | undefined }[],
): Map<string, string> {
  const badges = new Map<string, string>();
  const firstWith = new Map<string, string>();
  for (const { name, icon } of entries) {
    if (icon === undefined) continue;
    const earlier = firstWith.get(icon);
    if (earlier === undefined) firstWith.set(icon, name);
    else badges.set(name, distinguishingLetter(name, earlier));
  }
  return badges;
}

function distinguishingLetter(name: string, earlier: string): string {
  let at = 0;
  while (at < name.length && name[at] === earlier[at]) at++;
  const rest = name.slice(at).replace(/[^\p{L}\p{N}]/gu, '');
  return (rest.charAt(0) || name.charAt(0)).toLowerCase();
}
