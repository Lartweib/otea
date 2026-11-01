import { moveBlock } from './actions.ts';
import type { ButtonVariant } from './kit/index.ts';
import type { Item, Move } from './types.ts';

// Bulk moves: the tray under a selection offers only the moves every selected item can take now,
// never one waiting for an item's open children (requires: children_closed), and says what keeps the
// others out. moves: an item's moves as the API serves them to this browser, undefined while loading.
export type Selected = { item: Item; moves: readonly Move[] | undefined };

export type StateCount = { state: string; count: number };

export type BulkPlan = {
  moves: Move[];
  // The moves some items could take but not all, grouped by what keeps them out.
  hidden: { moves: string[]; why: string }[];
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

// The states as the tray's count zone says them: each with its count, or, when they do not all fit,
// the `keep` states with the most items (ties in their order) and how many more there are.
export function countsSummary(states: readonly StateCount[], keep = states.length): string[] {
  const said = ({ state, count }: StateCount) => `${count} ${state}`;
  if (keep >= states.length) return states.map(said);
  const most = [...states].sort((a, b) => b.count - a.count).slice(0, keep);
  return [...most.map(said), `+${states.length - keep} more`];
}

export function bulkPlan(selected: readonly Selected[]): BulkPlan {
  const states = statesOf(selected);
  const counted = [...states].map(([state, ids]) => ({ state, count: ids.length }));
  const counts = countsSummary(counted).join(' · ');
  const narrow =
    states.size > 1
      ? [...states].map(([state, ids]) => ({
          label: ids.length === 1 ? `only ${ids[0]}` : `only the ${ids.length} ${state}`,
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
    states: counted,
    counts,
    narrow,
    loading,
  };
}

// The moves in the tray, as the detail's action row has them: those that keep the items going, then
// those that throw work away (quiet, after "close as"). Past `fit` the rest wait under "N more";
// "close as" heads the closing moves where the first of them is.
export type Placed = { move: Move; variant: ButtonVariant };
export type TrayMoves = { shown: Placed[]; more: Placed[]; closeAs: 'shown' | 'more' | undefined };

export function trayMoves(
  moves: readonly Move[],
  variants: readonly ButtonVariant[],
  fit: number,
): TrayMoves {
  const placed = moves.map((move, index) => ({ move, variant: variants[index] ?? 'default' }));
  const ordered = [
    ...placed.filter(({ variant }) => variant !== 'quiet'),
    ...placed.filter(({ variant }) => variant === 'quiet'),
  ];
  const shown = ordered.slice(0, fit);
  const more = ordered.slice(fit);
  const closes = (some: readonly Placed[]) => some.some(({ variant }) => variant === 'quiet');
  return {
    shown,
    more,
    closeAs: closes(shown) ? 'shown' : closes(more) ? 'more' : undefined,
  };
}

// How many moves the tray's middle line holds, measured: the moves' widths in tray order, where the
// closing ones start (closeAt) with the "close as" label before them, the width of "N more", and the
// gap between each. Every move the room holds, six at most, with room left for more when some wait;
// a seventh never waits alone. Until the room is measured (0), all of them.
export type FitRow = {
  widths: readonly number[];
  closeAt: number;
  label: number;
  more: number;
  gap: number;
  room: number;
};

const MOST_SHOWN = 6;

export function fitMoves({ widths, closeAt, label, more, gap, room }: FitRow): number {
  const total = widths.length;
  if (room <= 0) return total;
  const span = (count: number, withMore: boolean) => {
    const labelled = closeAt < count;
    const pieces = count + (labelled ? 1 : 0) + (withMore ? 1 : 0);
    const sum = widths.slice(0, count).reduce((all, width) => all + width, 0);
    return sum + (labelled ? label : 0) + (withMore ? more : 0) + gap * Math.max(0, pieces - 1);
  };
  if (total <= MOST_SHOWN + 1 && span(total, false) <= room) return total;
  for (let count = Math.min(MOST_SHOWN, total - 1); count > 0; count--) {
    if (span(count, true) <= room) return count;
  }
  return 0;
}
