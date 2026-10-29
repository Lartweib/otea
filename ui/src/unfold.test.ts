import { describe, expect, it } from 'vitest';
import { afterFold, panelOf, reopen, select, type UnfoldState } from './unfold.ts';

const turns = { A: 'human', B: 'agent' } as const;
const turnOf = (id: string) => turns[id as keyof typeof turns];
const NONE: UnfoldState = {};

describe('select', () => {
  it('opens the selected row on the turn it has now', () => {
    expect(select(NONE, 'A', turnOf)).toEqual({ open: { id: 'A', turn: 'human' } });
  });

  it('folds the open row when nothing is selected any more', () => {
    const open = select(NONE, 'A', turnOf);
    expect(select(open, undefined, turnOf)).toEqual({ folding: { id: 'A', turn: 'human' } });
  });

  it('moves the detail to another row at once, without folding the first', () => {
    const open = select(NONE, 'A', turnOf);
    expect(select(open, 'B', turnOf)).toEqual({ open: { id: 'B', turn: 'agent' } });
  });

  it('learns the turn of a row selected before the list had it', () => {
    const early = select(NONE, 'A', () => undefined);
    expect(early).toEqual({ open: { id: 'A' } });
    expect(select(early, 'A', turnOf)).toEqual({ open: { id: 'A', turn: 'human' } });
  });

  it('returns the same state when nothing changed', () => {
    const open = select(NONE, 'A', turnOf);
    expect(select(open, 'A', turnOf)).toBe(open);
    expect(select(NONE, undefined, turnOf)).toBe(NONE);
  });
});

describe('panelOf', () => {
  const state: UnfoldState = {
    open: { id: 'A', turn: 'human' },
    folding: { id: 'B', turn: 'agent' },
  };

  it('shows the detail of the open row and of the one folding', () => {
    expect(panelOf(state, { id: 'A', turn: 'human' })).toBe('open');
    expect(panelOf(state, { id: 'B', turn: 'agent' })).toBe('folding');
    expect(panelOf(state, { id: 'C', turn: 'human' })).toBeUndefined();
  });

  it('drops the detail of a row that changed hands, so it never opens again in its new place', () => {
    expect(panelOf(state, { id: 'A', turn: 'none' })).toBeUndefined();
    expect(panelOf(state, { id: 'B', turn: 'human' })).toBeUndefined();
  });
});

describe('reopen', () => {
  it('opens a selected row again where it now sits', () => {
    const moved: UnfoldState = { open: { id: 'A', turn: 'human' } };
    expect(reopen(moved, { id: 'A', turn: 'agent' })).toEqual({ open: { id: 'A', turn: 'agent' } });
  });
});

describe('afterFold', () => {
  it('forgets the row once it has folded', () => {
    const state: UnfoldState = { folding: { id: 'B', turn: 'agent' } };
    expect(afterFold(state, 'B')).toEqual({});
  });

  it('keeps a newer fold', () => {
    const state: UnfoldState = { folding: { id: 'C', turn: 'agent' } };
    expect(afterFold(state, 'B')).toBe(state);
  });
});
