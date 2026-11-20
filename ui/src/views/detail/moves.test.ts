import { describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Move } from '../../types.ts';
import { type MoveChoice, moveSaysOf, otherMoves, planMoves } from './moves.ts';

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

  // The other ways on that the phone's page and Triage offer under Aprobar and Devolver (P7-R2-3,
  // P7-R3-2): a move to another step, never a send-back, a discard or a move that waits.
  it('names the other ways on: the quiet moves to another step that can be made now', () => {
    const accept: Move = { to: 'accepted', by: 'human', reasonRequired: false, turn: 'agent' };
    const ask: Move = { to: 'needs_info', by: 'human', reasonRequired: false, turn: 'human' };
    const waiting: Move = { ...ask, to: 'review', requires: ['children_closed'] };
    const plan = planMoves([accept, fixed, fixing, ask, waiting, wontFix], {
      own: false,
      word,
      waits: { children: { total: 1, open: 1, done: 0, discarded: 0 } },
    });
    expect(otherMoves(plan).map((c) => [c.move.to, c.label])).toEqual([
      ['fixed', 'Move to fixed'],
      ['needs_info', 'Move to needs_info'],
    ]);
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

  // A Pedido an agent drafts a board on closes when the person publishes the board in Studio:
  // approving it closed the Pedido and left the board unpublished.
  it('offers no Approve on a Pedido whose board waits as a draft, only the way back and discarding', () => {
    const plan = planMoves([fixed, fixing, wontFix], { own: false, word, draftWaits: true });
    expect(plan.primary).toBeNull();
    expect(plan.quiet.map((c) => c.move.to)).toEqual(['fixing']);
    expect(plan.close.map((c) => c.move.to)).toEqual(['wont_fix']);
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

describe('what an approve leads to, said before it acts', () => {
  const land: Move = { to: 'sland', by: 'human', reasonRequired: false, turn: 'agent' };

  // It follows the board's land step, which may merge through the forge (P3C-R3-4).
  it('says an approve into the land step lands it in the base as that step says (P5-15)', () => {
    const p = planMoves([land], { own: false, word });
    const lands = () => ({ agent: null, round: 1, lands: 'main', landStep: 'Integrar' });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: lands }).tail).toBe(
      'an agent then lands it in main, as the Integrar step says',
    );
    const any = () => ({ agent: null, round: 1, lands: '', landStep: 'Integrar' });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: any }).tail).toBe(
      'an agent then lands it, as the Integrar step says',
    );
  });

  // P5-R3-14: approving lets the agent push to the remote, and the hint never said so.
  it('says the land step pushes it to the remote when that step pushes', () => {
    const p = planMoves([land], { own: false, word });
    const lands = () => ({
      agent: null,
      round: 1,
      lands: 'main',
      landStep: 'Integrar',
      pushes: true as const,
    });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: lands }).tail).toBe(
      'an agent then lands it in main and pushes it to the remote, as the Integrar step says',
    );
    setLanguage('es');
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: lands }).tail).toBe(
      'luego un agente la integra en main y la sube al remoto, como dice el paso Integrar',
    );
    setLanguage('en');
  });

  it('says an approve that closes as Done merged nothing yet, on a board with no land step (P6-12)', () => {
    const p = planMoves([fixed], { own: false, word });
    const unmerged = () => ({ agent: null, round: 0, unmerged: true as const });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: unmerged }).tail).toBe(
      'it is Done, but its branch is not merged yet: it still has to be merged and marked merged',
    );
  });

  it('warns before an approve of a branch handed off never pushed (P7-8)', () => {
    const p = planMoves([land], { own: false, word });
    const lands = () => ({
      agent: null,
      round: 1,
      lands: 'main',
      landStep: 'Integrar',
      unpushed: 'tar-1',
    });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: lands }).tail).toBe(
      'an agent then lands it in main, as the Integrar step says; note: tar-1 was never pushed to the remote',
    );
  });

  it('says the base itself is pushed, never merged, on a main-only board (P2S-R3-2)', () => {
    const p = planMoves([land], { own: false, word });
    const lands = () => ({ agent: null, round: 1, lands: 'main', own: true as const });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: lands }).tail).toBe(
      'an agent then pushes main to the remote',
    );
  });

  it('says before an approve that the item brings no code change (P2S-R3-3)', () => {
    const p = planMoves([land], { own: false, word });
    const lands = () => ({ agent: null, round: 1, lands: 'main', unchanged: true as const });
    expect(moveSaysOf(must(p.primary), { agent: null, round: 1, word, back: lands }).tail).toBe(
      'it brings no code change: there is nothing to push',
    );
  });
});

describe('moveSaysOf on a board', () => {
  it('says the round and agent the way back lands on, when the board knows them', () => {
    const choice = { kind: 'sendback', move: { to: 'sfill' } } as unknown as MoveChoice;
    const says = moveSaysOf(choice, {
      agent: 'mender',
      round: 1,
      word,
      back: () => ({ agent: null, round: 1 }),
    });
    expect(says.tail).toBe(moveSaysOf(choice, { agent: null, round: 0, word }).tail);
  });
});
