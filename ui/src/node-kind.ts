import type { Turn } from './types.ts';

export type NodeKind = 'you' | 'working' | 'queued' | 'incomplete' | 'done' | 'discarded';

// Presets only say a closed state has turn none; whether it was finished or thrown away is read from its name.
const DISCARDED = /discard|cancel|reject|drop|wont|won't|duplicate|obsolete|abandon/i;

export function isDiscardedState(state: string): boolean {
  return DISCARDED.test(state);
}

export type NodeFacts = { turn: Turn; state: string; leased: boolean; incomplete: boolean };

export function nodeKind({ turn, state, leased, incomplete }: NodeFacts): NodeKind {
  if (turn === 'human') return 'you';
  if (turn === 'none') return isDiscardedState(state) ? 'discarded' : 'done';
  if (leased) return 'working';
  return incomplete ? 'incomplete' : 'queued';
}
