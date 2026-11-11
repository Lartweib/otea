import { describe, expect, it } from 'vitest';
import { creatures } from '../../../../src/core/board/testing.ts';
import {
  approvePractice,
  fillPart,
  handOff,
  type PracticeState,
  pickWay,
  practiceView,
  restartPractice,
  sendBackPractice,
  startPractice,
} from './practice.ts';

function start(): PracticeState {
  const state = startPractice(creatures());
  if (!state) throw new Error('no steps');
  return state;
}

const at = (s: PracticeState) => {
  const v = practiceView(s);
  return v.closed ? 'done' : `${v.step}:${v.phase}:${v.round}`;
};

describe('practice', () => {
  it('cannot start on a board with no steps', () => {
    const def = creatures();
    def.steps = [];
    expect(startPractice(def)).toBeNull();
  });

  it('refuses an empty handoff, then hands off once the step has what it asks for', () => {
    let s = start();
    expect(at(s)).toBe('sconcept:doing:1');
    expect(s.log).toEqual([{ kind: 'created', id: 'CRI-1', step: 'Concepto' }]);
    s = handOff(s);
    expect(at(s)).toBe('sconcept:doing:1');
    expect(s.said).toEqual({ kind: 'refused', missing: ['Arte conceptual'] });
    expect(s.log.at(-1)).toEqual({
      kind: 'refused',
      by: 'agent',
      who: null,
      missing: ['Arte conceptual'],
    });
    s = fillPart(s, 'eart');
    expect(practiceView(s).checklist.find(({ ref }) => ref === 'eart')?.ok).toBe(true);
    s = handOff(s);
    expect(at(s)).toBe('sconcept:review:1');
    expect(practiceView(s).actor).toBe('you');
  });

  it('asks for a note to send back; round 2 dips on the route and empties what is new each round', () => {
    let s = handOff(fillPart(start(), 'eart'));
    const silent = sendBackPractice(s, '  ');
    expect(silent.said).toEqual({ kind: 'note' });
    expect(at(silent)).toBe('sconcept:review:1');
    s = sendBackPractice(s, 'Más contraste');
    expect(at(s)).toBe('sconcept:doing:2');
    expect(s.said).toEqual({ kind: 'back', step: 'Concepto', round: 2, fresh: true });
    expect(practiceView(s).dips).toEqual([
      { from: 'sconcept', to: 'sconcept', at: expect.any(String) },
    ]);
    expect(practiceView(s).checklist.find(({ ref }) => ref === 'eart')?.ok).toBe(false);
    expect(s.log.at(-1)).toEqual({
      kind: 'sentBack',
      step: 'Concepto',
      note: 'Más contraste',
      to: 'Concepto',
      round: 2,
    });
  });

  it('walks the whole board: an agent reviewer’s other round, ways, Hecho', () => {
    let s = handOff(fillPart(start(), 'eart'));
    expect(practiceView(s).ways).toEqual(['sanimate', 'done']);
    s = approvePractice(s);
    expect(at(s)).toBe('sanimate:doing:1');
    expect(practiceView(s)).toMatchObject({ actor: 'agent', agent: 'kiln' });
    s = handOff(fillPart(fillPart(s, 'eanim'), 'fsteps'));
    expect(at(s)).toBe('sanimate:review:1');
    expect(practiceView(s)).toMatchObject({ actor: 'reviewer', agent: 'scout' });
    s = sendBackPractice(s, '');
    expect(at(s)).toBe('sconcept:doing:2');
    expect(s.log.at(-1)).toMatchObject({ kind: 'again', who: 'scout', step: 'Animar' });
    s = approvePractice(handOff(fillPart(s, 'eart')));
    s = approvePractice(handOff(fillPart(s, 'eanim')));
    expect(at(s)).toBe('spolish:doing:1');
    s = handOff(s);
    expect(at(s)).toBe('done');
    expect(s.log.at(-1)).toEqual({ kind: 'done', id: 'CRI-1' });
  });

  it('approves along the way picked', () => {
    let s = handOff(fillPart(start(), 'eart'));
    s = approvePractice(pickWay(s, 'done'));
    expect(at(s)).toBe('done');
    expect(s.log.at(-2)).toEqual({
      kind: 'approved',
      by: 'you',
      who: null,
      step: 'Concepto',
      to: 'done',
    });
  });

  it('starts again from the first step', () => {
    const s = restartPractice(handOff(fillPart(start(), 'eart')));
    expect(at(s)).toBe('sconcept:doing:1');
    expect(s.log).toEqual([{ kind: 'created', id: 'CRI-1', step: 'Concepto', again: true }]);
  });
});
