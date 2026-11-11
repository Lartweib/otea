import { describe, expect, it } from 'vitest';
import { agent, ago, item, moved, NOW, officialType, you } from './derive/fixtures.ts';
import {
  cardWords,
  dragIntent,
  dragProgress,
  exitPose,
  releaseDirection,
  roundOf,
  swipeAction,
  swipeThreshold,
  triagePlan,
  triageQueue,
  triCurrent,
  triDecide,
  triNext,
  triStart,
  triSync,
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
    requires: ['children_closed'],
  } as Move;
  const rework = { to: 'building', by: 'human', reasonRequired: true, turn: 'agent' } as const;
  const children = { total: 3, open: 2, done: 1, discarded: 0 };
  const waits = { children };

  it('never swipes a move that waits for children, and names it as blocked', () => {
    expect(triagePlan([close, rework], waits)).toEqual({
      back: rework,
      blocked: [{ move: close, note: 'waits for 2 open children' }],
    });
  });

  it('never swipes a working state that waits for children either', () => {
    const review = {
      to: 'review',
      by: 'human',
      reasonRequired: false,
      turn: 'human',
      requires: ['children_closed'],
    } as Move;
    const approve = { to: 'approved', by: 'human', reasonRequired: false, turn: 'agent' } as const;

    expect(triagePlan([review, approve, rework], waits)).toEqual({
      forward: approve,
      back: rework,
      blocked: [{ move: review, note: 'waits for 2 open children' }],
    });
  });

  it('swipes it once every child is closed', () => {
    expect(triagePlan([close, rework], { children: { ...children, open: 0 } })).toEqual({
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

describe('the pass (triStart, triSync, triDecide)', () => {
  it('starts on the first card, nothing decided', () => {
    const s = triStart(['A', 'B', 'C']);
    expect(triCurrent(s)).toBe('A');
    expect(triNext(s)).toBe('B');
    expect(s.decided).toBe(0);
  });

  it('approving or sending back moves on and counts a decision', () => {
    const s = triDecide(triDecide(triStart(['A', 'B', 'C']), 'approve'), 'send');
    expect(triCurrent(s)).toBe('C');
    expect(s.decided).toBe(2);
  });

  it('Later sends the card to the end of the pass without deciding it', () => {
    const s = triDecide(triStart(['A', 'B', 'C']), 'later');
    expect(s.q).toEqual(['B', 'C', 'A']);
    expect(triCurrent(s)).toBe('B');
    expect(s.decided).toBe(0);
  });

  it('Later on the last card shows it again', () => {
    const s = triDecide(triStart(['A']), 'later');
    expect(triCurrent(s)).toBe('A');
  });

  it('ends once every card was decided', () => {
    const s = triDecide(triDecide(triStart(['A', 'B']), 'approve'), 'approve');
    expect(triCurrent(s)).toBeUndefined();
    expect(triNext(s)).toBeUndefined();
  });

  it('a new review joins the end of the pass', () => {
    const s = triSync(triStart(['A', 'B']), ['A', 'B', 'C']);
    expect(s.q).toEqual(['A', 'B', 'C']);
  });

  it('a card still to come that left the reviews (moved elsewhere) drops out', () => {
    const s = triSync(triDecide(triStart(['A', 'B', 'C']), 'approve'), ['C']);
    expect(s.q).toEqual(['A', 'C']);
    expect(triCurrent(s)).toBe('C');
  });

  it('keeps the same pass when nothing changed', () => {
    const s = triStart(['A', 'B']);
    expect(triSync(s, ['B', 'A'])).toBe(s);
  });
});

describe('triageQueue', () => {
  const bug = officialType('bug-triage');
  const ctx = (feed = [] as ReturnType<typeof moved>[]) => ({ now: NOW, feed, types: () => bug });

  it('lists the reviews, the one waiting longest first', () => {
    const items = [
      item({ id: 'B', state: 'verify', updatedAt: ago(10) }),
      item({ id: 'A', state: 'verify', updatedAt: ago(90) }),
      item({ id: 'X', state: 'fixing', turn: 'agent' }),
    ];
    expect(triageQueue(items, ctx())).toEqual(['A', 'B']);
  });

  it('leaves out questions and your own steps', () => {
    const items = [
      item({ id: 'Q', state: 'reported' }),
      item({ id: 'O', state: 'reported', createdBy: { kind: 'human', name: 'you' } }),
      item({ id: 'R', state: 'verify' }),
    ];
    const feed = [moved('Q', 'reported', agent('scout'), { reason: '¿Lo dejamos?' })];
    expect(triageQueue(items, ctx(feed))).toEqual(['R']);
  });
});

describe('roundOf', () => {
  it('is the first round until you send the item back with notes', () => {
    expect(roundOf('A', [])).toBe(1);
  });

  it('adds a round for every time you sent it back with notes', () => {
    const feed = [
      moved('A', 'fixing', you, { reason: 'falta el anclaje' }),
      moved('A', 'verify', agent('mender')),
      moved('A', 'fixing', you, { reason: 'otra vez' }),
      moved('B', 'fixing', you, { reason: 'no es este' }),
      moved('A', 'verify', you),
    ];
    expect(roundOf('A', feed)).toBe(3);
  });
});

describe('cardWords', () => {
  it('names the agent that hands it to you, its words and the round', () => {
    const it0 = item({ id: 'A', state: 'verify' });
    const feed = [
      moved('A', 'fixing', you, { reason: 'falta' }),
      moved('A', 'verify', agent('mender'), { reason: 'Ya cruzan.' }),
    ];
    expect(cardWords(it0, feed)).toEqual({ agent: 'mender', say: 'Ya cruzan.', round: 2 });
  });

  it('has no agent when nobody handed it over', () => {
    expect(cardWords(item({ id: 'A' }), [])).toEqual({ agent: null, say: '', round: 1 });
  });
});

describe('exitPose', () => {
  it('flies an approval to the right and a send-back to the left, tilted', () => {
    expect(exitPose('approve')).toBe('translateX(120px) rotate(2deg)');
    expect(exitPose('send')).toBe('translateX(-120px) rotate(-2deg)');
  });

  it('drops a card left for later', () => {
    expect(exitPose('later')).toBe('translateY(24px) scale(0.97)');
  });
});
