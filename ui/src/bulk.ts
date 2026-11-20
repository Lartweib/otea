import { moveBlock } from './actions.ts';
import { t } from './i18n/i18n.ts';
import type { Item, Move } from './types.ts';

// Bulk moves: the tray under a selection offers only the moves every selected item can take now,
// never one waiting for an item's open children (requires: children_closed), and says what keeps the
// others out. moves: an item's moves as the API serves them to this browser, undefined while loading.
// blockers: how many items that block it are open, read with its moves.
// picks: where the approvals that carry a decision's pick lead (core pickAt): never made in bulk,
// the person picks each decision's option on its page.
export type Selected = {
  item: Item;
  moves: readonly Move[] | undefined;
  blockers?: number;
  picks?: readonly string[] | undefined;
};

export type StateCount = { state: string; count: number };

export type BulkPlan = {
  moves: Move[];
  // The moves some items could take but not all, grouped by what keeps them out.
  // pick: kept out because a decision is approved only by picking its option, on its page.
  hidden: { moves: string[]; why: string; pick?: true }[];
  // How many of each state, in the order the selection meets them, and as one line:
  // `2 reported · 1 verify`.
  states: StateCount[];
  counts: string;
  // With several states selected: keep only those of one state.
  narrow: { label: string; state: string; ids: string[] }[];
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
      const [only] = ids;
      return only && ids.length === 1
        ? t('bulk.whoOne', { id: only, state })
        : t('bulk.whoMany', { count: ids.length, state });
    })
    .join(', ');
}

// `EPICS-1 waits for 2 open children`, or how many wait when several do.
function blockedWhy(blocked: readonly { id: string; why: string }[]): string {
  const [only] = blocked;
  if (only && blocked.length === 1) return t('bulk.blockedOne', { id: only.id, why: only.why });
  return t('bulk.blockedMany', { count: blocked.length });
}

// The states as the tray's count zone says them: each with its count, or, when they do not all fit,
// the `keep` states with the most items (ties in their order) and how many more there are.
export function countsSummary(states: readonly StateCount[], keep = states.length): string[] {
  const said = ({ state, count }: StateCount) => t('bulk.stateCount', { count, state });
  if (keep >= states.length) return states.map(said);
  const most = [...states].sort((a, b) => b.count - a.count).slice(0, keep);
  return [...most.map(said), t('bulk.moreStates', { count: states.length - keep })];
}

export function bulkPlan(selected: readonly Selected[]): BulkPlan {
  const states = statesOf(selected);
  const counted = [...states].map(([state, ids]) => ({ state, count: ids.length }));
  const counts = countsSummary(counted).join(' · ');
  const narrow =
    states.size > 1
      ? [...states].map(([state, ids]) => ({
          label:
            ids.length === 1
              ? t('bulk.onlyOne', { id: ids[0] ?? '' })
              : t('bulk.onlyMany', { count: ids.length, state }),
          state,
          ids,
        }))
      : [];
  const loading = selected.some(({ moves }) => moves === undefined);
  if (loading) return { moves: [], hidden: [], states: counted, counts, narrow, loading };
  const all: Move[] = [];
  for (const { moves } of selected) {
    for (const move of moves ?? []) if (!all.some(({ to }) => to === move.to)) all.push(move);
  }
  const offered: Move[] = [];
  const hidden = new Map<string, string[]>();
  const hide = (why: string, to: string) => hidden.set(why, [...(hidden.get(why) ?? []), to]);
  const picked = new Set<string>();
  for (const move of all) {
    const missing = [
      ...new Set(
        selected
          .filter(({ moves }) => !moves?.some(({ to }) => to === move.to))
          .map(({ item }) => item.state),
      ),
    ];
    if (missing.length > 0) {
      hide(t('bulk.notFor', { who: whoOf(states, missing) }), move.to);
      continue;
    }
    const picking = selected.filter(({ picks }) => picks?.includes(move.to));
    const [onlyPick] = picking;
    if (onlyPick) {
      const why =
        picking.length === 1
          ? t('bulk.pickOne', { id: onlyPick.item.id })
          : t('bulk.pickMany', { count: picking.length });
      picked.add(why);
      hide(why, move.to);
      continue;
    }
    const blocked = selected.flatMap(({ item, moves, blockers }) => {
      const own = moves?.find(({ to }) => to === move.to);
      const why = own ? moveBlock(own, { children: item.children, blockers }) : undefined;
      return why ? [{ id: item.id, why }] : [];
    });
    if (blocked.length > 0) hide(blockedWhy(blocked), move.to);
    else offered.push(move);
  }
  return {
    moves: offered,
    hidden: [...hidden].map(([why, moves]) => ({
      moves,
      why,
      ...(picked.has(why) ? { pick: true as const } : {}),
    })),
    states: counted,
    counts,
    narrow,
    loading,
  };
}
