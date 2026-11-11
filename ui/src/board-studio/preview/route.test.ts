import { describe, expect, it } from 'vitest';
import { roundsOf } from '../../../../src/core/board/engine.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { definitionRoute } from './route.ts';

const words = { done: 'Hecho', dip: (n: number) => `ronda ${n} · devuelto` };

describe('definitionRoute', () => {
  it('lays each step on its doer’s lane, a review by the other side as a visit, Hecho on the trunk', () => {
    const route = definitionRoute(creatures(), { step: 'sconcept', phase: 'doing' }, [], words);
    expect(route.steps).toEqual([
      { name: 'sconcept', lane: 'ag' },
      { name: 'sconcept:review', lane: 'you' },
      { name: 'sanimate', lane: 'ag' },
      { name: 'spolish', lane: 'you' },
      { name: 'done', lane: 'none' },
    ]);
    expect(route.words).toEqual(['Concepto', '', 'Animar', 'Pulir', 'Hecho']);
    expect(route.ci).toBe(0);
    expect(route.lane).toBe('ag');
  });

  it('puts the node on the visit while you review, and at Hecho once closed', () => {
    const review = definitionRoute(creatures(), { step: 'sconcept', phase: 'review' }, [], words);
    expect([review.ci, review.lane]).toEqual([1, 'you']);
    const done = definitionRoute(creatures(), 'done', [], words);
    expect([done.ci, done.lane]).toEqual([4, 'none']);
  });

  it('keeps a review on the same lane at its step, and a review that falls to you on your lane', () => {
    const scout = definitionRoute(creatures(), { step: 'sanimate', phase: 'review' }, [], words);
    expect([scout.ci, scout.lane]).toEqual([2, 'ag']);
    const yours = definitionRoute(creatures(), { step: 'sanimate', phase: 'yours' }, [], words);
    expect([yours.ci, yours.lane]).toEqual([2, 'you']);
  });

  it('draws each send-back as a dip at the review it came from', () => {
    const def = creatures();
    const rounds = roundsOf(def, 'sconcept', 't0', [
      { from: 'sconcept', to: 'sconcept__review', at: 't1' },
      { from: 'sconcept__review', to: 'sconcept', at: 't2' },
      { from: 'sconcept', to: 'sconcept__review', at: 't3' },
      { from: 'sconcept__review', to: 'sanimate', at: 't4' },
      { from: 'sanimate', to: 'sanimate__review', at: 't5' },
      { from: 'sanimate__review', to: 'sconcept', at: 't6' },
    ]);
    const route = definitionRoute(def, { step: 'sconcept', phase: 'doing' }, rounds.dips, words);
    expect(route.dips).toEqual([
      { at: 1, label: 'ronda 1 · devuelto' },
      { at: 2, label: 'ronda 1 · devuelto' },
    ]);
  });
});
