import { describe, expect, it } from 'vitest';
import {
  type ActionState,
  canConfirm,
  IDLE,
  isBusy,
  moveTone,
  moveVariants,
  reduceAction,
} from './actions.ts';

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
