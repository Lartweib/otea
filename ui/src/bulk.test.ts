import { describe, expect, it } from 'vitest';
import { bulkPlan, fitMoves, trayMoves } from './bulk.ts';
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

describe('trayMoves', () => {
  const NINE = [ACCEPT, REJECT, move('fixing'), INFO, WONT, move('verify'), move('fixed')];
  const tones = (moves: readonly Move[]) =>
    moves.map((each) => (each.turn === 'none' && each.to !== 'fixed' ? 'quiet' : 'default'));

  it('puts the moves that close an item last, after the others', () => {
    const tray = trayMoves(NINE, tones(NINE), 9);

    expect(to(tray.shown.map(({ move }) => move))).toEqual([
      'accepted',
      'fixing',
      'needs_info',
      'verify',
      'fixed',
      'rejected',
      'wont_fix',
    ]);
    expect(tray.more).toEqual([]);
    expect(tray.closeAs).toBe('shown');
  });

  it('keeps the rest under more, and says close as there when no closing move is shown', () => {
    const tray = trayMoves(NINE, tones(NINE), 4);

    expect(to(tray.shown.map(({ move }) => move))).toEqual([
      'accepted',
      'fixing',
      'needs_info',
      'verify',
    ]);
    expect(to(tray.more.map(({ move }) => move))).toEqual(['fixed', 'rejected', 'wont_fix']);
    expect(tray.more.map(({ variant }) => variant)).toEqual(['default', 'quiet', 'quiet']);
    expect(tray.closeAs).toBe('more');
  });

  it('says close as nowhere when nothing closes', () => {
    expect(trayMoves([ACCEPT, INFO], ['primary', 'default'], 6).closeAs).toBeUndefined();
  });
});

describe('fitMoves', () => {
  // Five moves of 100, the last two close: "close as" is 60 wide, more 80, the gap 8.
  const row = { widths: [100, 100, 100, 100, 100], closeAt: 3, label: 60, more: 80, gap: 8 };

  it('shows every move the room holds', () => {
    // 5 × 100, the label, and a gap between each of the six
    expect(fitMoves({ ...row, room: 600 })).toBe(5);
  });

  it('keeps room for more when some must wait there', () => {
    // four moves, the label and more: 400 + 60 + 80 + 5 gaps
    expect(fitMoves({ ...row, room: 599 })).toBe(4);
    expect(fitMoves({ ...row, room: 580 })).toBe(4);
    // three moves (none closes) and more: 300 + 80 + 3 gaps
    expect(fitMoves({ ...row, room: 579 })).toBe(3);
    expect(fitMoves({ ...row, room: 403 })).toBe(2);
  });

  it('shows six at most, and never leaves one alone under more', () => {
    const widths = Array.from({ length: 8 }, () => 50);
    expect(fitMoves({ widths, closeAt: 8, label: 60, more: 80, gap: 8, room: 2000 })).toBe(6);
    expect(
      fitMoves({ widths: widths.slice(1), closeAt: 7, label: 60, more: 80, gap: 8, room: 2000 }),
    ).toBe(7);
  });

  it('shows them all until the room is measured', () => {
    expect(fitMoves({ ...row, room: 0 })).toBe(5);
  });
});
