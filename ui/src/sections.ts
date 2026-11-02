import { normalText, textValues } from './grid.ts';
import { type PlainKey, t } from './i18n/i18n.ts';
import type { CollectionView, Item, Turn } from './types.ts';

// A group of the list or the grid. Grouped by turn, a section holds one turn (and stays even when
// empty); grouped by anything else it has no turn of its own, and its rows sit on their own lanes.
export type Section = { key: string; turn?: Turn; title: string; items: Item[] };

const SECTIONS: ReadonlyArray<{ turn: Turn; title: PlainKey }> = [
  { turn: 'human', title: 'section.human' },
  { turn: 'agent', title: 'section.agent' },
  { turn: 'none', title: 'section.none' },
];

// A closed item cannot be updated, so its updatedAt is when it was closed: the latest closed comes first.
const byClosedRecency = (a: Item, b: Item) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

export function groupByTurn(items: readonly Item[]): Section[] {
  return SECTIONS.map((section) => {
    const own = items.filter((item) => item.turn === section.turn);
    const sorted = section.turn === 'none' ? own.sort(byClosedRecency) : own;
    return { turn: section.turn, title: t(section.title), key: section.turn, items: sorted };
  });
}

const GROUPS: readonly string[] = ['enum', 'severity', 'text'];

const BUILT_IN_GROUPS: Readonly<Record<string, PlainKey>> = {
  turn: 'group.turn',
  state: 'group.state',
  type: 'group.type',
};

// A grouping as the menus say it: turn, state and type in the language on screen, a field by its name.
export function groupingLabel(key: string): string {
  const builtIn = BUILT_IN_GROUPS[key];
  return builtIn ? t(builtIn) : key;
}

// What a collection can be grouped by: turn, state, its type when it has several, and every
// one-line field all its types have (an enum, a severity, free text), in the order they declare
// them; never the title, which every item has its own.
export function groupings(collection: CollectionView): string[] {
  const [first, ...rest] = collection.types;
  const fields = (first?.fields ?? []).filter(
    ({ name, module }) =>
      name !== 'title' &&
      GROUPS.includes(module) &&
      rest.every((type) => type.fields.some((field) => field.name === name)),
  );
  return [
    'turn',
    'state',
    ...(collection.types.length > 1 ? ['type'] : []),
    ...fields.map(({ name }) => name),
  ];
}

// The groups a grouping makes, in order, and how to read an item's group.
function groupsOf(
  by: string,
  collection: CollectionView,
  items: readonly Item[],
): { values: string[]; of: (item: Item) => string } {
  if (by === 'state') {
    const states = collection.types.flatMap((type) => type.states.map(({ name }) => name));
    return { values: [...new Set(states)], of: (item) => item.state };
  }
  if (by === 'type') {
    return { values: collection.types.map(({ name }) => name), of: (item) => item.type };
  }
  const field = collection.types[0]?.fields.find(({ name }) => name === by);
  if (field?.module === 'text') {
    // Free text: one group per value the items hold, as normalText reads it, A to Z.
    const of = (item: Item) => normalText(item.fields[by] ?? '');
    return { values: textValues(items, by), of };
  }
  const values = field?.module === 'severity' ? [...(field.values ?? [])].reverse() : field?.values;
  return { values: [...(values ?? []), ''], of: (item) => item.fields[by] ?? '' };
}

// Grouped by anything but turn, only the groups that hold items show, those without a value last.
// A grouping the collection does not offer (the preset changed) falls back to turn.
export function groupItems(
  items: readonly Item[],
  by: string,
  collection: CollectionView | undefined,
): Section[] {
  if (by === 'turn' || !collection || !groupings(collection).includes(by))
    return groupByTurn(items);
  const { values: declared, of } = groupsOf(by, collection, items);
  // A value the preset no longer lists (an older item) still shows, in a group of its own.
  const stale = items.map(of).filter((value) => value !== '' && !declared.includes(value));
  const values = [...declared.filter((value) => value !== ''), ...new Set(stale), ''];
  const labelOf = (key: string) => {
    if (key === '') return t('section.noValue', { group: groupingLabel(by) });
    if (by !== 'type') return key;
    return collection.types.find(({ name }) => name === key)?.label ?? key;
  };
  return values.flatMap((key) => {
    const own = items.filter((item) => of(item) === key);
    return own.length === 0 ? [] : [{ key, title: labelOf(key), items: own }];
  });
}
