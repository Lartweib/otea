import { describe, expect, it } from 'vitest';
import {
  approve,
  handoff,
  handoffCheck,
  mayTake,
  positionOf,
  reviewerFor,
  roundsOf,
  sendBack,
  startsWith,
  stateOf,
  turnAt,
  waysOf,
} from './engine.ts';
import type { BoardDefinition } from './model.ts';
import { creatures } from './testing.ts';

const def = creatures();
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 12, 10, minutes)).toISOString();
const kiln = { kind: 'agent' as const, name: 'kiln' };
const scout = { kind: 'agent' as const, name: 'scout' };
const you = { kind: 'human' as const, name: 'fede' };

// Animar done by any agent, still reviewed by scout.
function anyAnimates(): BoardDefinition {
  return {
    ...def,
    steps: def.steps.map((s) => (s.id === 'sanimate' ? { ...s, doer: 'any' as const } : s)),
  };
}

describe('positions and states', () => {
  it('names a step phase as a state and reads it back', () => {
    for (const position of [
      { step: 'sconcept', phase: 'doing' as const },
      { step: 'sconcept', phase: 'review' as const },
      { step: 'sanimate', phase: 'yours' as const },
      { closed: 'done' as const },
      { closed: 'dropped' as const },
    ]) {
      expect(positionOf(stateOf(position))).toEqual(position);
    }
    expect(stateOf({ step: 'sconcept', phase: 'doing' })).toBe('sconcept');
    expect(stateOf({ step: 'sconcept', phase: 'review' })).toBe('sconcept__review');
  });
});

describe('ways', () => {
  it('lists the default way first, then the alternatives, never twice', () => {
    expect(waysOf(def, 'sconcept')).toEqual(['sanimate', 'done']);
    expect(waysOf(def, 'spolish')).toEqual(['done']);
  });
});

describe('turns', () => {
  it('gives the doing phase to the doer and the review to the reviewer', () => {
    expect(turnAt(def, { step: 'sconcept', phase: 'doing' })).toEqual({ who: 'agent' });
    expect(turnAt(def, { step: 'sconcept', phase: 'review' })).toEqual({ who: 'you' });
    expect(turnAt(def, { step: 'sanimate', phase: 'doing' })).toEqual({
      who: 'agent',
      agent: 'kiln',
    });
    expect(turnAt(def, { step: 'sanimate', phase: 'review' })).toEqual({
      who: 'agent',
      agent: 'scout',
    });
    expect(turnAt(def, { step: 'sanimate', phase: 'yours' })).toEqual({ who: 'you' });
    expect(turnAt(def, { step: 'spolish', phase: 'doing' })).toEqual({ who: 'you' });
    expect(turnAt(def, { closed: 'done' })).toEqual({ who: 'none' });
  });

  it('lets any agent take an any-agent step, and only the named one take a named step', () => {
    expect(mayTake(def, 'sconcept', 'kiln')).toBe(true);
    expect(mayTake(def, 'sanimate', 'kiln')).toBe(true);
    expect(mayTake(def, 'sanimate', 'scout')).toBe(false);
    expect(mayTake(def, 'spolish', 'kiln')).toBe(false);
  });

  it('never lets an agent review its own work: the review becomes yours', () => {
    expect(reviewerFor(anyAnimates(), 'sanimate', 'scout')).toBe('you');
    expect(reviewerFor(anyAnimates(), 'sanimate', 'kiln')).toEqual({ agent: 'scout' });
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

  it('sends the review to you when the reviewer did the work', () => {
    const done = {
      fields: { fsteps: ['cone', 'ctwo'] },
      evidence: [{ part: 'eanim', at: at(12) }],
      roundStartedAt: at(10),
    };
    expect(
      handoff(anyAnimates(), { step: 'sanimate', phase: 'doing' }, done, { by: scout }),
    ).toEqual({ ok: true, to: { step: 'sanimate', phase: 'yours' } });
  });

  it('refuses a handoff out of turn or along a way the step does not have', () => {
    const review = { step: 'sconcept', phase: 'review' as const };
    expect(handoff(def, review, ready, { by: kiln })).toMatchObject({ code: 'not_doing' });
    const animate = { step: 'sanimate', phase: 'doing' as const };
    expect(handoff(def, animate, ready, { by: scout })).toMatchObject({ code: 'not_yours' });
    const polish = { step: 'spolish', phase: 'doing' as const };
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
