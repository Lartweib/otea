import type { Item, Turn } from './types.ts';

export type Section = { turn: Turn; title: string; items: Item[] };

const SECTIONS: ReadonlyArray<Omit<Section, 'items'>> = [
  { turn: 'human', title: 'Waiting for you' },
  { turn: 'agent', title: 'With agents' },
  { turn: 'none', title: 'Closed' },
];

// A closed item cannot be updated, so its updatedAt is when it was closed: the latest closed comes first.
const byClosedRecency = (a: Item, b: Item) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

export function groupByTurn(items: readonly Item[]): Section[] {
  return SECTIONS.map((section) => {
    const own = items.filter((item) => item.turn === section.turn);
    return { ...section, items: section.turn === 'none' ? own.sort(byClosedRecency) : own };
  });
}
