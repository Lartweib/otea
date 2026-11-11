import { describe, expect, it } from 'vitest';
import type { Move } from '../../types.ts';
import { type MoveChoice, moveSaysOf, planMoves } from './moves.ts';

const must = (c: MoveChoice | null | undefined): MoveChoice => {
  if (!c) throw new Error('no move');
  return c;
};

const word = (s: string) => ({ fixed: 'fixed', fixing: 'fixing', wont_fix: "won't fix" })[s] ?? s;

const fixed: Move = {
  to: 'fixed',
  by: 'human-ui',
  reasonRequired: false,
  turn: 'none',
  closes: 'done',
};
const fixing: Move = { to: 'fixing', by: 'human', reasonRequired: true, turn: 'agent' };
const wontFix: Move = {
  to: 'wont_fix',
  by: 'human-ui',
  reasonRequired: true,
  turn: 'none',
  closes: 'discarded',
};

describe('the moves, from the transitions and never from state names', () => {
  it('makes the first move that hands the turn on the primary: Approve', () => {
    const plan = planMoves([fixed, fixing, wontFix], { own: false, word });
    expect(plan.primary?.label).toBe('Approve');
    expect(plan.primary?.kind).toBe('approve');
    expect(plan.primary?.move.to).toBe('fixed');
  });

  it('calls it Mark done on your own step', () => {
    expect(planMoves([fixed], { own: true, word }).primary?.label).toBe('Mark done');
  });

  it('names a move back to an agent that asks a reason Send back…', () => {
    const plan = planMoves([fixed, fixing, wontFix], { own: false, word });
    expect(plan.quiet.map((c) => [c.kind, c.label])).toEqual([['sendback', 'Send back…']]);
  });

  it('names the state when there are several moves back', () => {
    const info: Move = { to: 'needs_info', by: 'human', reasonRequired: true, turn: 'agent' };
    const plan = planMoves([fixing, info], { own: false, word });
    expect(plan.quiet.map((c) => c.label)).toEqual([
      'Send back to fixing…',
      'Send back to needs_info…',
    ]);
  });

  it('puts closing as discarded after the rule, named by its state', () => {
    const plan = planMoves([fixed, fixing, wontFix], { own: false, word });
    expect(plan.close.map((c) => [c.kind, c.label])).toEqual([['discard', "Won't fix"]]);
  });

  it('makes any other move a quiet Move to', () => {
    const accept: Move = { to: 'accepted', by: 'human', reasonRequired: false, turn: 'agent' };
    const back: Move = { to: 'reported', by: 'human', reasonRequired: false, turn: 'human' };
    const plan = planMoves([accept, back], { own: false, word });
    expect(plan.primary?.move.to).toBe('accepted');
    expect(plan.quiet.map((c) => [c.kind, c.label])).toEqual([['move', 'Move to reported']]);
  });

  it('never makes a move waiting for children the primary, and says why it waits', () => {
    const review: Move = {
      to: 'review',
      by: 'human',
      reasonRequired: false,
      turn: 'human',
      requires: ['children_closed'],
    };
    const plan = planMoves([review], {
      own: false,
      word,
      waits: { children: { total: 2, open: 1, done: 1, discarded: 0 } },
    });
    expect(plan.primary).toBeNull();
    expect(plan.quiet[0]?.blocked).toBe('waits for 1 open child');
  });
});

describe('what the hovered move does (the movesays line)', () => {
  const plan = planMoves([fixed, fixing, wontFix], { own: false, word });

  it('says an approve that closes', () => {
    expect(moveSaysOf(must(plan.primary), { agent: 'Mender', round: 2, word })).toEqual({
      verb: 'Approve',
      state: 'fixed',
      tail: 'it closes',
    });
  });

  it('says a send back goes to the agent with your notes, in the next round', () => {
    expect(moveSaysOf(must(plan.quiet[0]), { agent: 'Mender', round: 2, word })).toEqual({
      verb: 'Send back',
      state: 'fixing',
      tail: 'back to Mender with your notes, in round 3',
    });
  });

  it('says a discard closes undone', () => {
    expect(moveSaysOf(must(plan.close[0]), { agent: 'Mender', round: 2, word }).tail).toBe(
      'it closes undone',
    );
  });

  it('says who takes it next', () => {
    const accept: Move = { to: 'accepted', by: 'human', reasonRequired: false, turn: 'agent' };
    const p = planMoves([accept], { own: false, word });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word }).tail).toBe(
      'an agent takes it',
    );
    expect(moveSaysOf(must(p.primary), { agent: 'Kiln', round: 1, word }).tail).toBe(
      'Kiln takes it',
    );
  });
});
