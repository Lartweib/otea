import { describe, expect, it } from 'vitest';
import { bulkPlan, countsSummary } from './bulk.ts';
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
      { label: 'only the 2 reported', state: 'reported', ids: ['BUGS-1', 'BUGS-2'] },
      { label: 'only BUGS-3', state: 'verify', ids: ['BUGS-3'] },
    ]);
  });

  it('keeps out a move that waits for open children of any selected item', () => {
    const DONE = move('done', { turn: 'none', closes: 'done', requires: ['children_closed'] });
    const open = { total: 3, open: 2, done: 1, discarded: 0 } as ChildrenSummary;
    const settled = { total: 2, open: 0, done: 2, discarded: 0 } as ChildrenSummary;
    const plan = bulkPlan([
      { item: item('EPICS-1', 'review', open), moves: [DONE, BACK] },
      { item: item('EPICS-2', 'review', settled), moves: [DONE, BACK] },
    ]);

    expect(to(plan.moves)).toEqual(['fixing']);
    expect(plan.hidden).toEqual([{ moves: ['done'], why: 'EPICS-1 waits for 2 open children' }]);
  });

  it('keeps out a move that waits for open blockers of any selected item', () => {
    const SHIP = move('shipped', { turn: 'none', closes: 'done', requires: ['blockers_closed'] });
    const plan = bulkPlan([
      { item: item('RELS-1', 'staging'), moves: [SHIP, BACK], blockers: 1 },
      { item: item('RELS-2', 'staging'), moves: [SHIP, BACK], blockers: 0 },
    ]);

    expect(to(plan.moves)).toEqual(['fixing']);
    expect(plan.hidden).toEqual([{ moves: ['shipped'], why: 'RELS-1 waits for 1 open blocker' }]);
  });

  it('never approves a decision in bulk: its approval goes through the pick, on its page', () => {
    const DESIGN = move('design');
    const plan = bulkPlan([
      { item: item('IDEAS-2', 'refine__review'), moves: [DESIGN, BACK], picks: ['design'] },
      { item: item('IDEAS-3', 'refine__review'), moves: [DESIGN, BACK] },
    ]);

    expect(to(plan.moves)).toEqual(['fixing']);
    expect(plan.hidden).toEqual([
      { moves: ['design'], why: 'IDEAS-2 is a decision: pick its option on its page', pick: true },
    ]);
    const many = bulkPlan([
      { item: item('IDEAS-2', 'refine__review'), moves: [DESIGN], picks: ['design'] },
      { item: item('IDEAS-3', 'refine__review'), moves: [DESIGN], picks: ['design'] },
    ]);
    expect(many.hidden).toEqual([
      { moves: ['design'], why: '2 are decisions: pick each one’s option on its page', pick: true },
    ]);
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

describe('countsSummary', () => {
  const plan = bulkPlan(
    [
      ['BUGS-1', 'fixing'],
      ['BUGS-2', 'reported'],
      ['BUGS-3', 'accepted'],
      ['BUGS-4', 'wont_fix'],
      ['BUGS-5', 'accepted'],
    ].map(([id = '', state = '']) => ({ item: item(id, state), moves: [] })),
  );

  it('counts each state in the order the selection meets them', () => {
    expect(plan.states).toEqual([
      { state: 'fixing', count: 1 },
      { state: 'reported', count: 1 },
      { state: 'accepted', count: 2 },
      { state: 'wont_fix', count: 1 },
    ]);
    expect(countsSummary(plan.states)).toEqual([
      '1 fixing',
      '1 reported',
      '2 accepted',
      '1 wont_fix',
    ]);
    expect(plan.counts).toBe('1 fixing · 1 reported · 2 accepted · 1 wont_fix');
  });

  it('keeps the states with the most items, ties in their order, and says how many more', () => {
    expect(countsSummary(plan.states, 2)).toEqual(['2 accepted', '1 fixing', '+2 more']);
    expect(countsSummary(plan.states, 1)).toEqual(['2 accepted', '+3 more']);
    expect(countsSummary(plan.states, 4)).toEqual(countsSummary(plan.states));
  });
});
