import { describe, expect, it } from 'vitest';
import {
  feedbackOf,
  frameAt,
  pin,
  stepFrame,
  swap,
  timeOf,
  toggleMark,
  verdictMoves,
} from './compare.ts';
import type { Move } from './types.ts';

describe('comparing rounds', () => {
  it('pins A and B to two different rounds, swapping when one takes the other’s', () => {
    expect(pin({ a: 2, b: 3 }, 'a', 1)).toEqual({ a: 1, b: 3 });
    expect(pin({ a: 2, b: 3 }, 'a', 3)).toEqual({ a: 3, b: 2 });
    expect(pin({ a: 2, b: 3 }, 'b', 3)).toEqual({ a: 2, b: 3 });
    expect(swap({ a: 2, b: 3 })).toEqual({ a: 3, b: 2 });
  });

  it('counts the clock in frames and wraps a step at both ends', () => {
    expect(frameAt(0.5)).toBe(12);
    expect(timeOf(12)).toBe(0.5);
    expect(stepFrame(0, -1, 24)).toBe(23);
    expect(stepFrame(23, 1, 24)).toBe(0);
    expect(stepFrame(5, 1, 0)).toBe(0);
  });

  it('marks and unmarks frames, in order, and carries them in the feedback', () => {
    const marks = toggleMark(toggleMark([], 12), 6);
    expect(marks).toEqual([6, 12]);
    expect(toggleMark(marks, 12)).toEqual([6]);
    expect(feedbackOf(' Slower still ', marks, 'Marked frames:')).toBe(
      'Slower still\n\nMarked frames: f 06, f 12',
    );
    expect(feedbackOf('', [], 'Marked frames:')).toBe('');
  });

  it('finds the approving move and the send-back among the human’s moves', () => {
    const moves: Move[] = [
      { to: 'approved', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
      { to: 'in_progress', by: 'human', reasonRequired: true, turn: 'agent' },
      { to: 'dropped', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
    ];
    const { approve, sendBack } = verdictMoves(moves);
    expect(approve?.to).toBe('approved');
    expect(sendBack?.to).toBe('in_progress');
    expect(verdictMoves([])).toEqual({});
  });

  it('never sends back by approving when the next step is an agent’s', () => {
    // An Encargos item in review: approving hands it on to the agent's Integrar step; sending
    // back returns it to the agent's work step with the feedback.
    const moves: Move[] = [
      { to: 'smerge', by: 'human', reasonRequired: false, turn: 'agent' },
      { to: 'swork', by: 'human', reasonRequired: true, turn: 'agent' },
      { to: 'dropped', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
    ];
    const { approve, sendBack } = verdictMoves(moves);
    expect(sendBack?.to).toBe('swork');
    expect(approve?.to).toBe('smerge');
  });

  it('offers no send-back when the only agent-bound move is the approval', () => {
    const moves: Move[] = [{ to: 'smerge', by: 'human', reasonRequired: false, turn: 'agent' }];
    expect(verdictMoves(moves)).toEqual({ approve: moves[0] });
  });
});
