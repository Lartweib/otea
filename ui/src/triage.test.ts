import { describe, expect, it } from 'vitest';
import {
  dragIntent,
  dragProgress,
  queueOf,
  releaseDirection,
  swipeAction,
  swipeThreshold,
  triagePlan,
} from './triage.ts';
import type { Move } from './types.ts';

const done: Move = { to: 'done', by: 'human-ui', reasonRequired: false, turn: 'none' };
const backWithReason: Move = { to: 'todo', by: 'human-ui', reasonRequired: true, turn: 'agent' };
const back: Move = { to: 'todo', by: 'human-ui', reasonRequired: false, turn: 'agent' };
const discard: Move = { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none' };
const ask: Move = { to: 'needs_info', by: 'human', reasonRequired: false, turn: 'human' };

describe('triagePlan with open children', () => {
  const close = {
    to: 'done',
    by: 'human',
    reasonRequired: false,
    turn: 'none',
    closes: 'done',
    closeRequires: 'children_closed',
  } as const;
  const rework = { to: 'building', by: 'human', reasonRequired: true, turn: 'agent' } as const;
  const children = { total: 3, open: 2, done: 1, discarded: 0 };

  it('never swipes a move that waits for children, and names it as blocked', () => {
    expect(triagePlan([close, rework], children)).toEqual({
      back: rework,
      blocked: [{ move: close, note: '2 children open' }],
    });
  });

  it('swipes it once every child is closed', () => {
    expect(triagePlan([close, rework], { ...children, open: 0 })).toEqual({
      forward: close,
      back: rework,
    });
  });
});

describe('triagePlan', () => {
  it('swipes right to the primary move and left to the move that sends the item back to an agent', () => {
    expect(triagePlan([done, backWithReason, discard])).toEqual({
      forward: done,
      back: backWithReason,
    });
  });

  it('never sends back with a move that keeps the turn with you or closes the item', () => {
    expect(triagePlan([done, ask, discard])).toEqual({ forward: done });
  });

  it('has no forward when no move is primary', () => {
    expect(triagePlan([backWithReason, discard])).toEqual({ back: backWithReason });
  });

  it('does not use the forward move as the way back when it also hands the turn to an agent', () => {
    const ship: Move = { to: 'deploy', by: 'human', reasonRequired: false, turn: 'agent' };
    expect(triagePlan([ship, backWithReason])).toEqual({ forward: ship, back: backWithReason });
    expect(triagePlan([ship])).toEqual({ forward: ship });
  });
});

describe('swipeAction', () => {
  it('performs the primary move on a right swipe', () => {
    expect(swipeAction('right', { forward: done, back })).toEqual({ kind: 'move', to: 'done' });
  });

  it('performs the send-back move on a left swipe when it needs no reason', () => {
    expect(swipeAction('left', { forward: done, back })).toEqual({ kind: 'move', to: 'todo' });
  });

  it('asks for the reason instead of moving when the send-back move requires one', () => {
    expect(swipeAction('left', { forward: done, back: backWithReason })).toEqual({
      kind: 'explain',
      to: 'todo',
    });
  });

  it('never performs a move that requires a reason, whichever the direction', () => {
    const forward = { ...done, reasonRequired: true };
    expect(swipeAction('right', { forward })).toEqual({ kind: 'explain', to: 'done' });
  });

  it('does nothing in a direction with no move', () => {
    expect(swipeAction('right', { back })).toEqual({ kind: 'none' });
    expect(swipeAction('left', { forward: done })).toEqual({ kind: 'none' });
  });
});

describe('dragIntent', () => {
  it('waits until the pointer has moved past the slop', () => {
    expect(dragIntent(4, 3)).toBe('pending');
  });

  it('drags when the motion is mostly sideways, and leaves vertical motion to scrolling', () => {
    expect(dragIntent(14, 4)).toBe('drag');
    expect(dragIntent(-14, 4)).toBe('drag');
    expect(dragIntent(4, 14)).toBe('scroll');
    expect(dragIntent(10, -12)).toBe('scroll');
  });
});

describe('swipeThreshold', () => {
  it('is a third of the card, kept between 80 and 160 pixels', () => {
    expect(swipeThreshold(330)).toBe(99);
    expect(swipeThreshold(150)).toBe(80);
    expect(swipeThreshold(900)).toBe(160);
  });
});

describe('releaseDirection', () => {
  const width = 330;

  it('commits once the card is dragged past the threshold', () => {
    expect(releaseDirection({ dx: 100, vx: 0, width })).toBe('right');
    expect(releaseDirection({ dx: -120, vx: 0, width })).toBe('left');
  });

  it('snaps back when released before the threshold', () => {
    expect(releaseDirection({ dx: 60, vx: 0.1, width })).toBeUndefined();
    expect(releaseDirection({ dx: -98, vx: 0, width })).toBeUndefined();
  });

  it('commits a quick flick that has travelled far enough', () => {
    expect(releaseDirection({ dx: 48, vx: 0.8, width })).toBe('right');
    expect(releaseDirection({ dx: -48, vx: -0.8, width })).toBe('left');
  });

  it('ignores a flick that is too short or runs against the drag', () => {
    expect(releaseDirection({ dx: 20, vx: 1.2, width })).toBeUndefined();
    expect(releaseDirection({ dx: 60, vx: -0.9, width })).toBeUndefined();
  });
});

describe('dragProgress', () => {
  it('rises from 0 to 1 as the card nears the threshold, in either direction', () => {
    expect(dragProgress(0, 330)).toBe(0);
    expect(dragProgress(-49.5, 330)).toBe(0.5);
    expect(dragProgress(300, 330)).toBe(1);
  });
});

describe('queueOf', () => {
  it('lists what waits for you, minus what you already decided or skipped here', () => {
    expect(queueOf(['A', 'B', 'C'], new Set(['B']))).toEqual(['A', 'C']);
  });

  it('keeps the order of the list', () => {
    expect(queueOf(['C', 'A'], new Set())).toEqual(['C', 'A']);
  });
});
