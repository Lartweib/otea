import { describe, expect, it } from 'vitest';
import {
  type ActionState,
  canConfirm,
  IDLE,
  isBusy,
  moveBlock,
  moveSays,
  moveTone,
  moveVariants,
  reduceAction,
  turnAgent,
} from './actions.ts';
import type { ItemEvent } from './types.ts';

const explaining = (reason = ''): ActionState => ({ step: 'explaining', to: 'todo', reason });

describe('actions', () => {
  it.each([
    [
      { to: 'done', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
      'approve',
    ],
    [
      { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
      'caution',
    ],
    [{ to: 'todo', by: 'human-ui', reasonRequired: true, turn: 'agent' }, 'caution'],
    [{ to: 'in_progress', by: 'agent', reasonRequired: false, turn: 'agent' }, 'neutral'],
  ] as const)('styles %j as %s', (move, tone) => {
    expect(moveTone(move)).toBe(tone);
  });

  it('asks for a reason before a move that requires one', () => {
    expect(reduceAction(IDLE, { type: 'explain', to: 'todo' })).toEqual(explaining());
  });

  it('keeps the typed reason', () => {
    expect(reduceAction(explaining(), { type: 'type', reason: 'Add tests' })).toEqual(
      explaining('Add tests'),
    );
  });

  it('goes back to choosing on cancel', () => {
    expect(reduceAction(explaining('x'), { type: 'cancel' })).toEqual(IDLE);
  });

  it.each([
    ['', false],
    ['   ', false],
    ['Add tests', true],
  ])('confirms a reason %j: %s', (reason, expected) => {
    expect(canConfirm(explaining(reason))).toBe(expected);
  });

  it('cannot confirm while choosing or posting', () => {
    expect(canConfirm(IDLE)).toBe(false);
    expect(canConfirm({ step: 'posting', to: 'todo', reason: 'x' })).toBe(false);
  });

  it('is busy only while posting', () => {
    const posting = reduceAction(explaining('x'), { type: 'submit', to: 'todo', reason: 'x' });

    expect(posting).toEqual({ step: 'posting', to: 'todo', reason: 'x' });
    expect(isBusy(posting)).toBe(true);
    expect(isBusy(IDLE)).toBe(false);
    expect(isBusy(explaining())).toBe(false);
  });

  it('shows the server message and keeps the reason when a move with a reason fails', () => {
    const posting: ActionState = { step: 'posting', to: 'todo', reason: 'x' };

    expect(reduceAction(posting, { type: 'failed', message: 'Nope' })).toEqual({
      step: 'explaining',
      to: 'todo',
      reason: 'x',
      error: 'Nope',
    });
  });

  it('shows the server message when a move without a reason fails', () => {
    const posting: ActionState = { step: 'posting', to: 'done', reason: '' };

    expect(reduceAction(posting, { type: 'failed', message: 'Nope' })).toEqual({
      step: 'choosing',
      error: 'Nope',
    });
  });

  it('clears a previous error when choosing again', () => {
    const failed: ActionState = { step: 'choosing', error: 'Nope' };

    expect(reduceAction(failed, { type: 'explain', to: 'todo' })).toEqual(explaining());
    expect(reduceAction(failed, { type: 'submit', to: 'done', reason: '' })).toEqual({
      step: 'posting',
      to: 'done',
      reason: '',
    });
  });

  it.each([
    ['without', ''],
    ['with', 'Add tests'],
  ])('returns to idle with buttons enabled after a successful move %s a reason', (_, reason) => {
    const posting: ActionState = { step: 'posting', to: 'todo', reason };

    const after = reduceAction(posting, { type: 'succeeded' });

    expect(after).toEqual(IDLE);
    expect(isBusy(after)).toBe(false);
    expect(canConfirm(after)).toBe(false);
  });

  describe('moveVariants', () => {
    const done = {
      to: 'done',
      by: 'human-ui',
      reasonRequired: false,
      turn: 'none',
      closes: 'done',
    } as const;
    const back = { to: 'todo', by: 'human-ui', reasonRequired: true, turn: 'agent' } as const;
    const discard = {
      to: 'discarded',
      by: 'human',
      reasonRequired: true,
      turn: 'none',
      closes: 'discarded',
    } as const;

    const waits = { ...done, requires: 'children_closed' } as const;
    const accept = { to: 'accepted', by: 'human', reasonRequired: false, turn: 'agent' } as const;
    const open = (count: number) => ({ total: 4, open: count, done: 4 - count, discarded: 0 });

    it('blocks a move that waits for children while some are open, and says how many', () => {
      expect(moveBlock(waits, open(3))).toBe('waits for 3 open children');
      expect(moveBlock(waits, open(1))).toBe('waits for 1 open child');
      expect(moveBlock(waits, open(0))).toBeUndefined();
      expect(moveBlock(waits, undefined)).toBeUndefined();
      expect(moveBlock(done, open(3))).toBeUndefined();
    });

    it('never makes a blocked move primary: the next eligible one is', () => {
      expect(moveVariants([waits, accept, discard], open(2))).toEqual([
        'default',
        'primary',
        'quiet',
      ]);
      expect(moveVariants([waits, back], open(2))).toEqual(['default', 'default']);
      expect(moveVariants([waits, accept], open(0))).toEqual(['primary', 'default']);
    });

    it('blocks a move into a working state that waits for children the same way', () => {
      const review = {
        to: 'review',
        by: 'agent',
        reasonRequired: false,
        turn: 'human',
        requires: 'children_closed',
      } as const;

      expect(moveBlock(review, open(4))).toBe('waits for 4 open children');
      expect(moveVariants([review, accept], open(4))).toEqual(['default', 'primary']);
      expect(moveBlock(review, open(0))).toBeUndefined();
    });

    it('makes the move that hands the turn on primary, discards quiet and the rest plain', () => {
      expect(moveVariants([done, back, discard])).toEqual(['primary', 'default', 'quiet']);
    });

    it('never offers more than one primary', () => {
      const ship = {
        to: 'shipped',
        by: 'human',
        reasonRequired: false,
        turn: 'none',
        closes: 'done',
      } as const;
      expect(moveVariants([done, ship])).toEqual(['primary', 'default']);
    });

    it('offers no primary when no move hands the turn on without a reason', () => {
      expect(moveVariants([back, discard])).toEqual(['default', 'quiet']);
    });

    it('reads a discard from how the move closes the item, not from the state name', () => {
      const park = {
        to: 'parked',
        by: 'human',
        reasonRequired: false,
        turn: 'none',
        closes: 'discarded',
      } as const;
      const reject = {
        to: 'rejected',
        by: 'human-ui',
        reasonRequired: false,
        turn: 'none',
        closes: 'done',
      } as const;

      expect(moveVariants([park, reject])).toEqual(['quiet', 'primary']);
    });

    it('does not make a discard primary even when it needs no reason', () => {
      const drop = {
        to: 'discarded',
        by: 'human',
        reasonRequired: false,
        turn: 'none',
        closes: 'discarded',
      } as const;
      expect(moveVariants([drop, done])).toEqual(['quiet', 'primary']);
    });
  });
});

describe('turnAgent', () => {
  const event = (actor: ItemEvent['actor'], data: Record<string, unknown> = {}): ItemEvent => ({
    id: 1,
    type: 'transitioned',
    actor,
    at: '2026-11-01T10:00:00Z',
    data,
  });

  it('is the agent that acted last on the item', () => {
    const events = [
      event({ kind: 'agent', name: 'claude-a' }),
      event({ kind: 'agent', name: 'claude-b' }),
      event({ kind: 'human', name: 'human' }, { channel: 'ui' }),
    ];
    expect(turnAgent(events)).toBe('claude-b');
  });

  it('counts the agent that relayed your words', () => {
    const events = [
      event({ kind: 'agent', name: 'claude-a' }),
      event({ kind: 'human', name: 'human' }, { via: 'claude-c' }),
    ];
    expect(turnAgent(events)).toBe('claude-c');
  });

  it('is nobody when no agent has acted', () => {
    expect(turnAgent([event({ kind: 'human', name: 'human' })])).toBeUndefined();
  });
});

describe('moveSays', () => {
  const accept = { to: 'accepted', by: 'human', reasonRequired: false, turn: 'agent' } as const;
  const ask = { ...accept, to: 'needs_info', reasonRequired: true } as const;
  const reject = {
    to: 'rejected',
    by: 'human-ui',
    reasonRequired: true,
    turn: 'none',
    closes: 'discarded',
  } as const;
  const fixed = {
    to: 'fixed',
    by: 'human-ui',
    reasonRequired: false,
    turn: 'none',
    closes: 'done',
  } as const;

  it('hands the turn to the agent, out of Waiting for you', () => {
    expect(moveSays(accept, { turn: 'human', agent: 'claude-b' })).toBe(
      'claude-b’s turn · it leaves Waiting for you',
    );
  });

  it('says when the move asks a reason first', () => {
    expect(moveSays(ask, { turn: 'human', agent: 'claude-b' })).toBe(
      'claude-b’s turn · it leaves Waiting for you · asks a reason first',
    );
  });

  it('names no agent it does not know', () => {
    expect(moveSays(accept, { turn: 'agent' })).toBe('an agent’s turn');
  });

  it('brings an item to you', () => {
    const review = { ...accept, to: 'review', turn: 'human' } as const;
    expect(moveSays(review, { turn: 'agent', agent: 'claude-a' })).toBe(
      'your turn · it comes to Waiting for you',
    );
    expect(moveSays(review, { turn: 'human' })).toBe('your turn');
  });

  it('says plainly that a move closes the item, and how', () => {
    expect(moveSays(fixed, { turn: 'human' })).toBe('closes the item as done');
    expect(moveSays(reject, { turn: 'human' })).toBe(
      'closes the item as discarded · asks a reason first',
    );
  });
});
