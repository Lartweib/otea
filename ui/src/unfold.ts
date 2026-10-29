import type { Turn } from './types.ts';

// Which rows of a phone list show their detail. A detail belongs to the row on the turn it had when it
// opened: once the row changes hands it moves to another section, and the detail does not follow it.

// turn is unknown while the list has not loaded the row yet.
export type Opened = { id: string; turn?: Turn };

export type UnfoldState = { open?: Opened; folding?: Opened };

type Row = { id: string; turn: Turn };

export function select(
  state: UnfoldState,
  selectedId: string | undefined,
  turnOf: (id: string) => Turn | undefined,
): UnfoldState {
  const { open } = state;
  if (selectedId === undefined) return open ? { folding: open } : state;
  if (open?.id === selectedId) {
    const turn = turnOf(selectedId);
    return open.turn === undefined && turn !== undefined
      ? { ...state, open: { id: open.id, turn } }
      : state;
  }
  const turn = turnOf(selectedId);
  return { open: turn === undefined ? { id: selectedId } : { id: selectedId, turn } };
}

const holds = (opened: Opened | undefined, row: Row) =>
  opened !== undefined && opened.id === row.id && opened.turn === row.turn;

export function panelOf(state: UnfoldState, row: Row): 'open' | 'folding' | undefined {
  if (holds(state.open, row)) return 'open';
  if (holds(state.folding, row)) return 'folding';
  return undefined;
}

export function reopen(state: UnfoldState, row: Row): UnfoldState {
  return { ...state, open: { id: row.id, turn: row.turn } };
}

export function afterFold(state: UnfoldState, id: string): UnfoldState {
  if (state.folding?.id !== id) return state;
  const { folding: _done, ...rest } = state;
  return rest;
}
