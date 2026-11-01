import { describe, expect, it } from 'vitest';
import { bulkPlan } from './bulk.ts';
import type { ChildrenSummary, Item, Move } from './types.ts';

const item = (id: string, state: string, children?: ChildrenSummary): Item => ({
  id,
  collection: 'bugs',
  type: 'item',
  title: id,
  fields: {},
  presetVersion: 1,
  state,
  turn: 'human',
  createdAt: 't',
  updatedAt: 't',
  createdBy: { kind: 'agent', name: 'a' },
  lease: null,
  ...(children ? { children } : {}),
});

const move = (to: string, extra: Partial<Move> = {}): Move => ({
  to,
  by: 'human',
  reasonRequired: false,
  turn: 'agent',
  ...extra,
});

const ACCEPT = move('accepted');
const INFO = move('needs_info', { reasonRequired: true });
const REJECT = move('rejected', { by: 'human-ui', reasonRequired: true, turn: 'none' });
const APPROVE = move('fixed', { by: 'human-ui', turn: 'none', closes: 'done' });
const BACK = move('fixing', { reasonRequired: true });
const WONT = move('wont_fix', { reasonRequired: true, turn: 'none', closes: 'discarded' });

const REPORTED = [ACCEPT, INFO, REJECT, WONT];
const VERIFY = [APPROVE, BACK, WONT];

const to = (moves: readonly Move[]) => moves.map(({ to }) => to);

describe('bulkPlan', () => {
  it('offers every move of one item, and what it counts', () => {
    const plan = bulkPlan([{ item: item('BUGS-1', 'reported'), moves: REPORTED }]);

    expect(to(plan.moves)).toEqual(['accepted', 'needs_info', 'rejected', 'wont_fix']);
    expect(plan.hidden).toEqual([]);
    expect(plan.counts).toBe('1 reported');
    expect(plan.narrow).toEqual([]);
  });

  it('offers only the moves every selected item can take, and says what the others are kept from', () => {
    const plan = bulkPlan([
      { item: item('BUGS-1', 'reported'), moves: REPORTED },
      { item: item('BUGS-2', 'reported'), moves: REPORTED },
      { item: item('BUGS-3', 'verify'), moves: VERIFY },
    ]);

    expect(to(plan.moves)).toEqual(['wont_fix']);
    expect(plan.counts).toBe('2 reported · 1 verify');
    expect(plan.hidden).toEqual([
      { moves: ['accepted', 'needs_info', 'rejected'], why: 'not for BUGS-3 (verify)' },
      { moves: ['fixed', 'fixing'], why: 'not for the 2 reported' },
    ]);
    expect(plan.narrow).toEqual([
      { label: 'only the 2 reported', ids: ['BUGS-1', 'BUGS-2'] },
      { label: 'only BUGS-3', ids: ['BUGS-3'] },
    ]);
  });

  it('keeps out a move that waits for open children of any selected item', () => {
    const DONE = move('done', { turn: 'none', closes: 'done', requires: 'children_closed' });
    const open = { total: 3, open: 2, done: 1, discarded: 0 } as ChildrenSummary;
    const settled = { total: 2, open: 0, done: 2, discarded: 0 } as ChildrenSummary;
    const plan = bulkPlan([
      { item: item('EPICS-1', 'review', open), moves: [DONE, BACK] },
      { item: item('EPICS-2', 'review', settled), moves: [DONE, BACK] },
    ]);

    expect(to(plan.moves)).toEqual(['fixing']);
    expect(plan.hidden).toEqual([{ moves: ['done'], why: 'EPICS-1 waits for 2 open children' }]);
  });

  it('offers nothing while the moves of an item are still loading', () => {
    const plan = bulkPlan([
      { item: item('BUGS-1', 'reported'), moves: REPORTED },
      { item: item('BUGS-2', 'reported'), moves: undefined },
    ]);

    expect(plan.moves).toEqual([]);
    expect(plan.loading).toBe(true);
  });
});
