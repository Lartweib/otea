import { moveBlock } from './actions.ts';
import type { Item, Move } from './types.ts';

// Bulk moves: the bar under a selection offers only the moves every selected item can take now,
// never one waiting for an item's open children (requires: children_closed), and says what keeps the
// others out. moves: an item's moves as the API serves them to this browser, undefined while loading.
export type Selected = { item: Item; moves: readonly Move[] | undefined };

export type BulkPlan = {
  moves: Move[];
  // The moves some items could take but not all, grouped by what keeps them out.
  hidden: { moves: string[]; why: string }[];
  // How many of each state: `2 reported · 1 verify`.
  counts: string;
  // With several states selected: keep only those of one state.
  narrow: { label: string; ids: string[] }[];
  loading: boolean;
};

function statesOf(selected: readonly Selected[]): Map<string, string[]> {
  const states = new Map<string, string[]>();
  for (const { item } of selected)
    states.set(item.state, [...(states.get(item.state) ?? []), item.id]);
  return states;
}

// Who a move is not for: one item by its id and state, several by how many of a state.
function whoOf(states: ReadonlyMap<string, string[]>, missing: readonly string[]): string {
  return missing
    .map((state) => {
      const ids = states.get(state) ?? [];
      return ids.length === 1 ? `${ids[0]} (${state})` : `the ${ids.length} ${state}`;
    })
    .join(', ');
}

// `EPICS-1 waits for 2 open children`, or how many wait when several do.
function blockedWhy(blocked: readonly { id: string; why: string }[]): string {
  const [only] = blocked;
  if (only && blocked.length === 1) return `${only.id} ${only.why}`;
  return `${blocked.length} wait for open children`;
}

export function bulkPlan(selected: readonly Selected[]): BulkPlan {
  const states = statesOf(selected);
  const counts = [...states].map(([state, ids]) => `${ids.length} ${state}`).join(' · ');
  const narrow =
    states.size > 1
      ? [...states].map(([state, ids]) => ({
          label: ids.length === 1 ? `only ${ids[0]}` : `only the ${ids.length} ${state}`,
          ids,
        }))
      : [];
  const loading = selected.some(({ moves }) => moves === undefined);
  if (loading) return { moves: [], hidden: [], counts, narrow, loading };
  const all: Move[] = [];
  for (const { moves } of selected) {
    for (const move of moves ?? []) if (!all.some(({ to }) => to === move.to)) all.push(move);
  }
  const offered: Move[] = [];
  const hidden = new Map<string, string[]>();
  const hide = (why: string, to: string) => hidden.set(why, [...(hidden.get(why) ?? []), to]);
  for (const move of all) {
    const missing = [
      ...new Set(
        selected
          .filter(({ moves }) => !moves?.some(({ to }) => to === move.to))
          .map(({ item }) => item.state),
      ),
    ];
    if (missing.length > 0) {
      hide(`not for ${whoOf(states, missing)}`, move.to);
      continue;
    }
    const blocked = selected.flatMap(({ item, moves }) => {
      const own = moves?.find(({ to }) => to === move.to);
      const why = own ? moveBlock(own, item.children) : undefined;
      return why ? [{ id: item.id, why }] : [];
    });
    if (blocked.length > 0) hide(blockedWhy(blocked), move.to);
    else offered.push(move);
  }
  return {
    moves: offered,
    hidden: [...hidden].map(([why, moves]) => ({ moves, why })),
    counts,
    narrow,
    loading,
  };
}
