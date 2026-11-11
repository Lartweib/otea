import type { Look } from '../lanes/looks.ts';

// The node Studio draws for a state, or for a sample sitting in it: the one the list gives an item
// there (SPEC §4.1). Studio has no leases, so an agent's state is an open ring, dashed where the
// type keeps its incomplete items.
export function stateLook(
  state: { turn: string; closes?: string | undefined },
  incomplete = false,
): Look {
  if (state.turn === 'human') return 'yours';
  if (state.turn === 'none') return state.closes === 'discarded' ? 'dropped' : 'done';
  return incomplete ? 'waiting' : 'queued';
}
