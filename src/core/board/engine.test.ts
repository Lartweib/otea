import { describe, expect, it } from 'vitest';
import {
  approve,
  handoff,
  handoffCheck,
  initialPosition,
  mayReview,
  mayTake,
  positionOf,
  roundsOf,
  sendBack,
  sentBackAt,
  startsWith,
  stateOf,
  turnAt,
  waysOf,
} from './engine.ts';
import type { BoardDefinition } from './model.ts';
import { creatures, step } from './testing.ts';

const def = creatures();
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 12, 10, minutes)).toISOString();
const kiln = { kind: 'agent' as const, name: 'kiln' };
const scout = { kind: 'agent' as const, name: 'scout' };
const you = { kind: 'human' as const, name: 'fede' };

describe('positions and states', () => {
  it('names a step phase as a state and reads it back', () => {
    for (const position of [
      { step: 'sconcept', phase: 'doing' as const },
      { step: 'sconcept', phase: 'review' as const },
      { closed: 'done' as const },
      { closed: 'dropped' as const },
    ]) {
      expect(positionOf(stateOf(position))).toEqual(position);
    }
    expect(stateOf({ step: 'sconcept', phase: 'doing' })).toBe('sconcept');
    expect(stateOf({ step: 'sconcept', phase: 'review' })).toBe('sconcept__review');
  });

  it("reads the person's review an older board kept apart as the step's review", () => {
    expect(positionOf('sanimate__yours')).toEqual({ step: 'sanimate', phase: 'review' });
  });
});

describe('ways', () => {
  it('lists the default way first, then the alternatives, never twice', () => {
    expect(waysOf(def, 'sconcept')).toEqual(['sanimate', 'done']);
    expect(waysOf(def, 'spolish')).toEqual(['done']);
  });
});

// P4-R3-1: a step can lead elsewhere than its next step while the item holds a value: a to-do the
// person does («Lo hago yo»: sí) leads from their own step to Hecho, and never to an agent's step.
describe('a lead', () => {
  const led: BoardDefinition = {
    ...creatures(),
    parts: {
      fmine: { id: 'fmine', name: 'Lo hago yo', kind: 'yesno', hint: '', options: [] },
      fdid: { id: 'fdid', name: 'Lo que hice', kind: 'long', hint: '', options: [] },
    },
    steps: [
      step('sown', 'Lo haces tú', {
        doer: 'you',
        reviewer: 'none',
        hand: [{ ref: 'fdid', req: 'when', when: { part: 'fmine', value: 'yes' }, fresh: false }],
        ways: ['done'],
        lead: { to: 'done', when: { part: 'fmine', value: 'yes' } },
        skipWhenReady: true,
      }),
      step('sdo', 'Hacerlo', { ways: ['sown'] }),
    ],
  };
  const own = { step: 'sown', phase: 'doing' as const };
  const mine = { fields: { fmine: 'yes', fdid: 'Fotos sacadas' }, evidence: [] };
  const theirs = { fields: { fmine: 'no' }, evidence: [] };

  it('leads to its target while the value holds, and leaves out the next step', () => {
    expect(waysOf(led, 'sown', mine)).toEqual(['done']);
    expect(waysOf(led, 'sown', theirs)).toEqual(['sdo', 'done']);
    // Without the item, every way the step may take.
    expect(waysOf(led, 'sown')).toEqual(['sdo', 'done']);
  });

  it('hands off along the lead and refuses the next step while it holds', () => {
    expect(handoff(led, own, mine, { by: you })).toEqual({ ok: true, to: { closed: 'done' } });
    expect(handoff(led, own, mine, { by: you, way: 'sdo' })).toMatchObject({ code: 'bad_way' });
    expect(handoff(led, own, theirs, { by: you })).toEqual({
      ok: true,
      to: { step: 'sdo', phase: 'doing' },
    });
  });

  it('never skips a step whose lead holds for a new item', () => {
    expect(initialPosition(led, mine).position).toEqual(own);
    expect(initialPosition(led, theirs).position).toEqual({ step: 'sdo', phase: 'doing' });
  });
});

describe('turns', () => {
  it('gives the doing phase to the doer and the review to the reviewer', () => {
    expect(turnAt(def, { step: 'sconcept', phase: 'doing' })).toEqual({ who: 'agent' });
    expect(turnAt(def, { step: 'sconcept', phase: 'review' })).toEqual({ who: 'you' });
    expect(turnAt(def, { step: 'sanimate', phase: 'doing' })).toEqual({ who: 'agent' });
    expect(turnAt(def, { step: 'sanimate', phase: 'review' })).toEqual({ who: 'agent' });
    expect(turnAt(def, { step: 'spolish', phase: 'doing' })).toEqual({ who: 'you' });
    expect(turnAt(def, { closed: 'done' })).toEqual({ who: 'none' });
  });

  it('lets any agent take an any-agent step, and none take yours', () => {
    expect(mayTake(def, 'sconcept')).toBe(true);
    expect(mayTake(def, 'sanimate')).toBe(true);
    expect(mayTake(def, 'sanimate')).toBe(true);
    expect(mayTake(def, 'spolish')).toBe(false);
  });

  it('never lets an agent review a step it did in that round: another agent does', () => {
    const review = { step: 'sanimate', phase: 'review' as const };
    expect(mayReview(def, review, scout, ['scout'])).toBe(false);
    expect(mayReview(def, review, kiln, ['scout'])).toBe(true);
    expect(mayReview(def, review, you, ['scout'])).toBe(true);
    const yours = { step: 'sconcept', phase: 'review' as const };
    expect(mayReview(def, yours, kiln)).toBe(false);
    expect(mayReview(def, yours, you, ['kiln'])).toBe(true);
  });
});

describe('handoffCheck', () => {
  const facts = (over = {}) => ({ fields: {}, evidence: [], roundStartedAt: at(10), ...over });

  it('lists what is required and missing, with why', () => {
    expect(handoffCheck(def, 'sconcept', facts()).missing).toEqual([
      { ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true },
    ]);
  });

  it('wants fresh evidence from this round, not an older one', () => {
    const old = facts({ evidence: [{ part: 'eart', at: at(5) }] });
    expect(handoffCheck(def, 'sconcept', old).missing).toEqual([
      { ref: 'eart', name: 'Arte conceptual', reason: 'not_new', fresh: true },
    ]);
    const now = facts({ evidence: [{ part: 'eart', at: at(12) }] });
    expect(handoffCheck(def, 'sconcept', now)).toEqual({ ok: true, missing: [] });
  });

  it('requires a "when" part only while the value it reads holds', () => {
    const art = [{ part: 'eart', at: at(12) }];
    const swamp = facts({ fields: { fbiome: 'cswamp' }, evidence: art });
    expect(handoffCheck(def, 'sconcept', swamp).missing.map(({ ref }) => ref)).toEqual(['eswamp']);
    const wood = facts({ fields: { fbiome: 'cwood' }, evidence: art });
    expect(handoffCheck(def, 'sconcept', wood).ok).toBe(true);
  });

  it('wants every box of a required checklist ticked', () => {
    const anim = [{ part: 'eanim', at: at(12) }];
    const half = facts({ fields: { fsteps: ['cone'] }, evidence: anim });
    expect(handoffCheck(def, 'sanimate', half).missing).toEqual([
      { ref: 'fsteps', name: 'Comprobaciones', reason: 'unchecked', fresh: false },
    ]);
    const all = facts({ fields: { fsteps: '["cone","ctwo"]' }, evidence: anim });
    expect(handoffCheck(def, 'sanimate', all).ok).toBe(true);
  });

  it('wants a proof for every ticked point of a checklist that asks for proof', () => {
    const proving = structuredClone(def);
    const steps = proving.parts.fsteps;
    if (steps) steps.proof = true;
    const anim = [{ part: 'eanim', at: at(12) }];
    const ticked = { fields: { fsteps: '["cone","ctwo"]' }, evidence: anim };
    expect(handoffCheck(proving, 'sanimate', facts(ticked)).missing).toEqual([
      {
        ref: 'fsteps',
        name: 'Comprobaciones',
        reason: 'unproved',
        fresh: false,
        points: ['Silueta', 'Paleta'],
      },
    ]);
    const one = facts({ ...ticked, proofs: { fsteps: ['cone'] } });
    expect(handoffCheck(proving, 'sanimate', one).missing[0]?.points).toEqual(['Paleta']);
    const both = facts({ ...ticked, proofs: { fsteps: ['cone', 'ctwo'] } });
    expect(handoffCheck(proving, 'sanimate', both).ok).toBe(true);
    // A checklist that does not ask for proof hands off without one.
    expect(handoffCheck(def, 'sanimate', facts(ticked)).ok).toBe(true);
  });

  it('wants a proof for a ticked point of an optional checklist that asks for proof', () => {
    const proving = structuredClone(def);
    const steps = proving.parts.fsteps;
    if (steps) steps.proof = true;
    const hand = proving.steps[1]?.hand.find(({ ref }) => ref === 'fsteps');
    if (hand) hand.req = 'no';
    const anim = [{ part: 'eanim', at: at(12) }];
    // Optional: nothing ticked hands off; a ticked point still needs its proof.
    expect(handoffCheck(proving, 'sanimate', facts({ evidence: anim })).ok).toBe(true);
    const ticked = facts({ fields: { fsteps: '["ctwo"]' }, evidence: anim });
    expect(handoffCheck(proving, 'sanimate', ticked).missing).toEqual([
      {
        ref: 'fsteps',
        name: 'Comprobaciones',
        reason: 'unproved',
        fresh: false,
        points: ['Paleta'],
      },
    ]);
    const proved = facts({
      fields: { fsteps: '["ctwo"]' },
      evidence: anim,
      proofs: { fsteps: ['ctwo'] },
    });
    expect(handoffCheck(proving, 'sanimate', proved).ok).toBe(true);
  });

  it('wants a note after a send-back, even where the step asks for none', () => {
    const art = [{ part: 'eart', at: at(12) }];
    expect(handoffCheck(def, 'sconcept', facts({ evidence: art, sentBack: true })).missing).toEqual(
      [{ ref: 'note', name: 'note', reason: 'missing', fresh: true, hint: '', sentBack: true }],
    );
    const said = facts({ evidence: art, sentBack: true, note: 'Más barro en las patas' });
    expect(handoffCheck(def, 'sconcept', said).ok).toBe(true);
  });
});

describe('moves', () => {
  const ready = { fields: {}, evidence: [{ part: 'eart', at: at(12) }], roundStartedAt: at(10) };
  const concept = { step: 'sconcept', phase: 'doing' as const };

  it('refuses a handoff with what is missing', () => {
    const result = handoff(def, concept, { fields: {}, evidence: [] }, { by: kiln });
    expect(result).toEqual({
      ok: false,
      code: 'missing',
      missing: [expect.objectContaining({ ref: 'eart' })],
    });
  });

  it('hands off to the reviewer, or along the way when nobody reviews', () => {
    expect(handoff(def, concept, ready, { by: kiln })).toEqual({
      ok: true,
      to: { step: 'sconcept', phase: 'review' },
    });
    expect(handoff(def, { step: 'spolish', phase: 'doing' }, ready, { by: you })).toEqual({
      ok: true,
      to: { closed: 'done' },
    });
  });

  it('hands an agent-reviewed step to its review, whoever did it', () => {
    const done = {
      fields: { fsteps: ['cone', 'ctwo'] },
      evidence: [{ part: 'eanim', at: at(12) }],
      roundStartedAt: at(10),
    };
    expect(handoff(def, { step: 'sanimate', phase: 'doing' }, done, { by: scout })).toEqual({
      ok: true,
      to: { step: 'sanimate', phase: 'review' },
    });
  });

  it('refuses a handoff out of turn or along a way the step does not have', () => {
    const review = { step: 'sconcept', phase: 'review' as const };
    expect(handoff(def, review, ready, { by: kiln })).toMatchObject({ code: 'not_doing' });
    const polish = { step: 'spolish', phase: 'doing' as const };
    expect(handoff(def, polish, ready, { by: scout })).toMatchObject({ code: 'not_yours' });
    expect(handoff(def, polish, ready, { by: you, way: 'sconcept' })).toMatchObject({
      code: 'bad_way',
    });
  });

  it('approves along the default way or a picked one', () => {
    const review = { step: 'sconcept', phase: 'review' as const };
    expect(approve(def, review)).toEqual({ ok: true, to: { step: 'sanimate', phase: 'doing' } });
    expect(approve(def, review, 'done')).toEqual({ ok: true, to: { closed: 'done' } });
    expect(approve(def, concept)).toMatchObject({ ok: false, code: 'not_review' });
  });

  it('refuses the review of the agent that did the round, approval or send-back', () => {
    const review = { step: 'sanimate', phase: 'review' as const };
    const facts = { fields: {}, evidence: [], did: ['scout'] };
    expect(approve(def, review, undefined, facts, scout)).toEqual({ ok: false, code: 'own_work' });
    expect(sendBack(def, review, { by: scout, did: ['scout'] })).toEqual({
      ok: false,
      code: 'own_work',
    });
    expect(approve(def, review, undefined, facts, kiln)).toMatchObject({ ok: true });
    expect(sendBack(def, review, { by: kiln, did: ['scout'] })).toMatchObject({ ok: true });
  });

  it('sends back to this step or the earlier one it names', () => {
    expect(sendBack(def, { step: 'sconcept', phase: 'review' })).toEqual({
      ok: true,
      to: { step: 'sconcept', phase: 'doing' },
    });
    expect(sendBack(def, { step: 'sanimate', phase: 'review' })).toEqual({
      ok: true,
      to: { step: 'sconcept', phase: 'doing' },
    });
  });
});

describe('roundsOf', () => {
  it('starts no round on a move a publish or a restore made, unless the step was never entered', () => {
    const rounds = roundsOf(def, 'sconcept', at(0), [
      { from: 'sconcept', to: 'sconcept__review', at: at(1) },
      { from: 'sconcept__review', to: 'sconcept', at: at(2), quiet: true },
      { from: 'sconcept', to: 'sanimate', at: at(3), quiet: true },
    ]);
    expect(rounds).toEqual({
      rounds: { sconcept: 1, sanimate: 1 },
      startedAt: { sconcept: at(0), sanimate: at(3) },
      dips: [],
    });
  });

  it('counts every entry into a step, never restarting, and says when the current round began', () => {
    const rounds = roundsOf(def, 'sconcept', at(0), [
      { from: 'sconcept', to: 'sconcept__review', at: at(1) },
      { from: 'sconcept__review', to: 'sconcept', at: at(2) },
      { from: 'sconcept', to: 'sconcept__review', at: at(3) },
      { from: 'sconcept__review', to: 'sanimate', at: at(4) },
      { from: 'sanimate', to: 'sanimate__review', at: at(5) },
      { from: 'sanimate__review', to: 'sconcept', at: at(6) },
    ]);
    expect(rounds).toEqual({
      rounds: { sconcept: 3, sanimate: 1 },
      startedAt: { sconcept: at(6), sanimate: at(4) },
      dips: [
        { from: 'sconcept', to: 'sconcept', at: at(2) },
        { from: 'sanimate', to: 'sconcept', at: at(6) },
      ],
    });
  });
});

describe('sentBackAt', () => {
  it('finds the send-back that started the step’s current round, never a way back or an older one', () => {
    const moves = [
      { from: 'sconcept', to: 'sconcept__review', at: at(1) },
      { from: 'sconcept__review', to: 'sconcept', at: at(2) },
    ];
    expect(sentBackAt(def, moves, 'sconcept')).toBe(1);
    const again = [
      ...moves,
      { from: 'sconcept', to: 'sconcept__review', at: at(3) },
      { from: 'sconcept__review', to: 'sanimate', at: at(4) },
      { from: 'sanimate', to: 'sanimate__review', at: at(5) },
      { from: 'sanimate__review', to: 'sconcept', at: at(6) },
    ];
    expect(sentBackAt(def, again, 'sconcept')).toBe(5);
    expect(sentBackAt(def, again, 'sanimate')).toBe(-1);
    // The doer taking it back is not a send-back; a quiet move after it changes nothing.
    const takenBack = [
      { from: 'sconcept', to: 'sconcept__review', at: at(1) },
      { from: 'sconcept__review', to: 'sanimate', at: at(2) },
      { from: 'sanimate', to: 'sconcept', at: at(3) },
    ];
    expect(sentBackAt(def, takenBack, 'sconcept')).toBe(-1);
    expect(
      sentBackAt(
        def,
        [...moves, { from: 'sconcept', to: 'sconcept', at: at(3), quiet: true }],
        'sconcept',
      ),
    ).toBe(1);
  });
});

describe('startsWith', () => {
  it('lists the title, the form and everything handed off before the step', () => {
    expect(startsWith(def, 'sconcept')).toEqual([
      { ref: 'title' },
      { ref: 'fdesc' },
      { ref: 'fbiome' },
    ]);
    expect(startsWith(def, 'sanimate').slice(3)).toEqual([
      { ref: 'eart', from: 'sconcept' },
      { ref: 'eswamp', from: 'sconcept' },
    ]);
  });
});
