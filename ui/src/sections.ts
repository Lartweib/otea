import type { Item, Turn } from './types.ts';

export type Section = { turn: Turn; title: string; items: Item[] };

const SECTIONS: ReadonlyArray<Omit<Section, 'items'>> = [
  { turn: 'human', title: 'Waiting for you' },
  { turn: 'agent', title: 'With agents' },
  { turn: 'none', title: 'Closed' },
];

export function groupByTurn(items: readonly Item[]): Section[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => item.turn === section.turn),
  }));
}
