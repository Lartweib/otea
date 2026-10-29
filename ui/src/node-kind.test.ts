import { describe, expect, it } from 'vitest';
import { isDiscardedState, nodeKind } from './node-kind.ts';

describe('isDiscardedState', () => {
  it('reads closed states that throw the work away as discarded', () => {
    for (const state of [
      'discarded',
      'cancelled',
      'canceled',
      'rejected',
      'dropped',
      'wontfix',
      'duplicate',
      'obsolete',
      'abandoned',
    ]) {
      expect(isDiscardedState(state)).toBe(true);
    }
  });

  it('reads every other closed state as done', () => {
    for (const state of ['done', 'approved', 'fixed', 'shipped', 'closed', 'merged']) {
      expect(isDiscardedState(state)).toBe(false);
    }
  });
});

describe('nodeKind', () => {
  const open = { turn: 'agent' as const, state: 'todo', leased: false, incomplete: false };

  it('marks your turn as yours', () => {
    expect(nodeKind({ ...open, turn: 'human', state: 'review' })).toBe('you');
  });

  it('shows an agent at work while a lease is held', () => {
    expect(nodeKind({ ...open, leased: true })).toBe('working');
    expect(nodeKind({ ...open, incomplete: true, leased: true })).toBe('working');
  });

  it('shows an incomplete item nobody holds as incomplete', () => {
    expect(nodeKind({ ...open, state: 'incomplete', incomplete: true })).toBe('incomplete');
  });

  it('shows an agent-turn item nobody holds as queued', () => {
    expect(nodeKind(open)).toBe('queued');
  });

  it('splits closed items into done and discarded', () => {
    expect(nodeKind({ ...open, turn: 'none', state: 'done' })).toBe('done');
    expect(nodeKind({ ...open, turn: 'none', state: 'discarded' })).toBe('discarded');
  });
});
