import { describe, expect, it } from 'vitest';
import { backWaysOf, waysOf } from '../../../../src/core/board/engine.ts';
import { cambios, creatures, errores, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import {
  addBackWay,
  addMotive,
  addNote,
  addWait,
  addWay,
  moveStep,
  removeBackWay,
  removeChoice,
  removeMotive,
  removeNote,
  removeStep,
  removeWait,
  renameStep,
  replaceBackWay,
  setDoerMayDrop,
  setDropBy,
  setGuard,
  setGuardBase,
  setGuardRepo,
  setInitial,
  setNoteHint,
  setNoteReq,
  setSkip,
  setSplit,
  setSplitAlways,
  toggleGuardPush,
} from './edits.ts';

const counter = () => {
  let n = 0;
  return (kind: string) => `${kind}new${++n}`;
};

describe('ways back', () => {
  it('adds an earlier step as a way back, kept apart from the ways forward', () => {
    const def = creatures();
    addBackWay(def, 'spolish', 'sconcept');
    expect(backWaysOf(def, 'spolish')).toEqual(['sconcept']);
    expect(waysOf(def, 'spolish')).toEqual(['done']);
    addBackWay(def, 'spolish', 'sconcept');
    addBackWay(def, 'spolish', 'spolish');
    addBackWay(def, 'spolish', 'done');
    expect(def.steps[2]?.ways).toEqual(['sconcept']);
  });

  it('keeps the rows in board order and replaces or removes one', () => {
    const def = creatures();
    addBackWay(def, 'spolish', 'sanimate');
    addBackWay(def, 'spolish', 'sconcept');
    expect(backWaysOf(def, 'spolish')).toEqual(['sconcept', 'sanimate']);
    replaceBackWay(def, 'spolish', 'sanimate', 'sconcept');
    expect(backWaysOf(def, 'spolish')).toEqual(['sconcept']);
    removeBackWay(def, 'spolish', 'sconcept');
    expect(backWaysOf(def, 'spolish')).toEqual([]);
  });

  it('a way forward added after a way back leaves the way back in place', () => {
    const def = creatures();
    addBackWay(def, 'sanimate', 'sconcept');
    addWay(def, 'sanimate', 'done');
    expect(backWaysOf(def, 'sanimate')).toEqual(['sconcept']);
    expect(waysOf(def, 'sanimate')).toEqual(['spolish', 'done']);
  });

  it('a move never turns a way back into a way forward, or the other way round', () => {
    const def = creatures();
    addBackWay(def, 'spolish', 'sanimate');
    // Concepto goes to Hecho; Pulir goes back to Animar.
    moveStep(def, 'spolish', -1);
    // Pulir is now before Animar: its way back to Animar would lead forward, so it goes.
    expect(def.steps.map((s) => s.id)).toEqual(['sconcept', 'spolish', 'sanimate']);
    expect(def.steps[1]?.ways).toEqual([]);
    expect(def.steps[0]?.ways).toEqual(['done']);
  });

  it('removing a step drops it from every way back and from the protected branch', () => {
    const def = tareasDeRepo();
    removeStep(def, 'sprop');
    expect(def.steps.flatMap((s) => s.ways)).toEqual([]);
    const other = tareasDeRepo();
    removeStep(other, 'simpl');
    expect(other.parts.fbranch?.guard?.push).toEqual([]);
  });

  it('renaming a step keeps its id everywhere', () => {
    const def = errores();
    renameStep(def, 'striage', 'Clasificar');
    expect(backWaysOf(def, 'sfix')).toEqual(['striage']);
  });
});

describe('the handoff note', () => {
  it('adds one note per step, required, with what goes there', () => {
    const def = creatures();
    addNote(def, 'sconcept', 'qué cambió en esta ronda');
    expect(def.steps[0]?.note).toEqual({ req: 'always', hint: 'qué cambió en esta ronda' });
    setNoteHint(def, 'sconcept', 'la prueba');
    setNoteReq(def, 'sconcept', 'no', 'qué cambió');
    expect(def.steps[0]?.note).toEqual({ req: 'no', hint: 'la prueba' });
    removeNote(def, 'sconcept');
    expect(def.steps[0]?.note).toEqual({ req: 'no', hint: '' });
  });

  it('an optional note with no hint keeps a hint, so its row stays', () => {
    const def = creatures();
    addNote(def, 'sconcept', '');
    setNoteReq(def, 'sconcept', 'no', 'qué cambió');
    expect(def.steps[0]?.note).toEqual({ req: 'no', hint: 'qué cambió' });
  });
});

describe('waits', () => {
  it('adds and removes what a step waits for, once each, parts first', () => {
    const def = cambios();
    addWait(def, 'sanalyse', 'blockers');
    addWait(def, 'sanalyse', 'parts');
    addWait(def, 'sanalyse', 'parts');
    expect(def.steps[0]?.waits).toEqual(['parts', 'blockers']);
    removeWait(def, 'sanalyse', 'parts');
    expect(def.steps[0]?.waits).toEqual(['blockers']);
  });
});

describe('skip on creation, and the doer dropping it', () => {
  it('switches each one on and off', () => {
    const def = errores();
    setSkip(def, 'sfill', false);
    expect(def.steps[0]?.skipWhenReady).toBe(false);
    setDoerMayDrop(def, 'sfill', true);
    expect(def.steps[0]?.doerMayDrop).toBe(true);
  });
});

describe('start values', () => {
  it('sets and clears the value a field starts with', () => {
    const def = creatures();
    setInitial(def, 'fbiome', 'cwood');
    expect(def.parts.fbiome?.initial).toBe('cwood');
    setInitial(def, 'fbiome', undefined);
    expect(def.parts.fbiome && 'initial' in def.parts.fbiome).toBe(false);
  });

  it('a removed choice takes its start value with it', () => {
    const def = creatures();
    setInitial(def, 'fbiome', 'cwood');
    removeChoice(def, 'fbiome', 'cwood');
    expect(def.parts.fbiome && 'initial' in def.parts.fbiome).toBe(false);
  });
});

describe('the protected branch', () => {
  it('protects a branch with the given push steps, and stops protecting it', () => {
    const def = tareasDeRepo();
    setGuard(def, 'fbranch', false);
    expect(def.parts.fbranch?.guard).toBeUndefined();
    setGuard(def, 'fbranch', true, ['simpl']);
    expect(def.parts.fbranch?.guard).toEqual({ push: ['simpl'] });
  });

  it('picks several push steps, in board order, and the field the repository is read from', () => {
    const def = tareasDeRepo();
    toggleGuardPush(def, 'fbranch', 'sprop');
    expect(def.parts.fbranch?.guard?.push).toEqual(['sprop', 'simpl']);
    toggleGuardPush(def, 'fbranch', 'simpl');
    expect(def.parts.fbranch?.guard?.push).toEqual(['sprop']);
    setGuardRepo(def, 'fbranch', undefined);
    expect(def.parts.fbranch?.guard).toEqual({ push: ['sprop'] });
    setGuardRepo(def, 'fbranch', 'frepo');
    expect(def.parts.fbranch?.guard?.repo).toBe('frepo');
  });

  it('protects the base branch too, by name, and stops when turned off', () => {
    const def = tareasDeRepo();
    setGuardBase(def, 'fbranch', 'main');
    expect(def.parts.fbranch?.guard?.base).toBe('main');
    setGuardBase(def, 'fbranch', 'release/2.x');
    expect(def.parts.fbranch?.guard?.base).toBe('release/2.x');
    setGuardBase(def, 'fbranch', undefined);
    expect(def.parts.fbranch?.guard).not.toHaveProperty('base');
    setGuard(def, 'fbranch', false);
    setGuardBase(def, 'fbranch', 'main');
    expect(def.parts.fbranch?.guard).toBeUndefined();
  });

  it('never guards a field that is not a branch', () => {
    const def = tareasDeRepo();
    setGuard(def, 'frepo', true, ['simpl']);
    expect(def.parts.frepo?.guard).toBeUndefined();
  });
});

describe('discarding', () => {
  it('says who discards, and adds or removes a motive by name with its own id', () => {
    const def = creatures();
    setDropBy(def, 'page');
    expect(def.drop.by).toBe('page');
    addMotive(def, 'No se arreglará', counter());
    addMotive(def, 'Duplicado', counter());
    addMotive(def, ' duplicado ', counter());
    addMotive(def, '  ', counter());
    expect(def.drop.motives).toEqual([
      { id: 'no_se_arreglara', name: 'No se arreglará' },
      { id: 'duplicado', name: 'Duplicado' },
    ]);
    removeMotive(def, 'no_se_arreglara');
    expect(def.drop.motives.map((m) => m.name)).toEqual(['Duplicado']);
  });

  it('gives a motive whose name has no letters a fresh id', () => {
    const def = creatures();
    addMotive(def, '¿?', counter());
    expect(def.drop.motives[0]?.id).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('the split', () => {
  it('divides into another board, always by default, then into nothing', () => {
    const def = creatures();
    setSplit(def, 'brt');
    expect(def.split).toEqual({ board: 'brt', always: true });
    setSplitAlways(def, false);
    expect(def.split).toEqual({ board: 'brt', always: false });
    setSplit(def, 'same');
    expect(def.split).toEqual({ board: 'same', always: false });
    setSplit(def, undefined);
    expect(def.split).toBeUndefined();
  });
});
