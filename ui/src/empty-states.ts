import { laneOf, X } from './lanes/geometry.ts';
import type { Look } from './lanes/looks.ts';
import type { Item, PresetView } from './types.ts';

// What the list says when there is nothing (yet) to list. Each state is a doorway: it says what fills
// the lanes and how.
// - first-run: no collection yet; pick a preset, it previews its route on the lanes.
// - empty-collection: a collection without items; an agent files the first one (or you do).
// - empty-project: collections, but no item in any (All work).
// - inbox-zero: items, none on your turn; your lane keeps running, empty.
export type EmptyKind = 'first-run' | 'empty-collection' | 'empty-project' | 'inbox-zero';

export type EmptyFacts = {
  collections: number;
  // The items in the list's scope (a collection's, or every item under All work).
  scoped: readonly Pick<Item, 'turn'>[];
  // The collection listed; undefined under All work.
  collection: string | undefined;
  // Grouped by turn: only then does the list show your lane's section.
  byTurn: boolean;
};

export function emptyKind({
  collections,
  scoped,
  collection,
  byTurn,
}: EmptyFacts): EmptyKind | undefined {
  if (collections === 0) return 'first-run';
  if (scoped.length === 0) return collection === undefined ? 'empty-project' : 'empty-collection';
  if (!byTurn) return undefined;
  const yours = scoped.some(({ turn }) => turn === 'human');
  const open = scoped.some(({ turn }) => turn !== 'none');
  return !yours && open ? 'inbox-zero' : undefined;
}

// The collection a preset makes first, named as the official presets mean it.
const FIRST_NAMES: Readonly<Record<string, string>> = {
  'bug-triage': 'bugs',
  tasks: 'tasks',
  change: 'changes',
};

export function firstName(preset: string): string {
  return FIRST_NAMES[preset] ?? preset;
}

export function addCommand(preset: string, name = firstName(preset)): string {
  return `otea collection add ${name} --preset ${preset}`;
}

export function createCommand(collection: string, title: string): string {
  return `otea create --collection ${collection} --title "${title}"`;
}

export function playbookCommand(collection: string): string {
  return `otea playbook --collection ${collection}`;
}

export const CONNECT_COMMAND = 'otea connect --as claude-a';

// One stop of a preset's route: a state, on the lane of its turn, drawn as its look.
export type Stop = { name: string; x: number; look: Look };

export type Route = { stops: Stop[]; height: number; path: string };

// A preset's states down the lanes, in the order it declares them, joined by one line that crosses
// between the lanes as the turn changes, as an item travels it. step: the height of a stop.
export function routeOf(preset: PresetView, step: number): Route {
  const type = preset.types[0];
  const states = type?.states ?? [];
  const stops = states.map(({ name, turn, closes }): Stop => {
    const look: Look =
      turn === 'human'
        ? 'yours'
        : turn === 'none'
          ? closes === 'discarded'
            ? 'dropped'
            : 'done'
          : name === type?.incomplete
            ? 'waiting'
            : 'queued';
    return { name, x: X[laneOf(turn)], look };
  });
  const y = (index: number) => index * step + step / 2;
  const path = stops
    .map(({ x }, index) => {
      if (index === 0) return `M${x} ${y(0)}`;
      const from = stops[index - 1]?.x ?? x;
      const mid = y(index) - step / 2;
      return `C${from} ${mid} ${x} ${mid} ${x} ${y(index)}`;
    })
    .join(' ');
  return { stops, height: stops.length * step, path };
}
