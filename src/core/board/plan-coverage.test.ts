import { describe, expect, it } from 'vitest';
import type { BoardDefinition, Part, Step } from './model.ts';
import { changePlan, itemEffects, itemMoves } from './plan.ts';
import { cambios, errores, tareasDeRepo } from './testing.ts';

// Errores before its later settings: no ways back, no note, no waits, no skip, no drop by an agent,
// no motives, no guard, no start value.
function plain(): BoardDefinition {
  const def = errores();
  def.steps = def.steps.map((step) => ({
    ...step,
    ways: [],
    note: { req: 'no', hint: '' },
    waits: [],
    skipWhenReady: false,
    doerMayDrop: false,
  }));
  def.drop = { by: 'anyone', motives: [] };
  delete def.parts.fbranch?.guard;
  delete def.split;
  return def;
}

describe('changePlan, the later settings', () => {
  it('says each new setting as a sentence of its own', () => {
    const draft = errores();
    draft.parts.fcat = { ...(draft.parts.fcat as Part), initial: 'cgame' };
    draft.list = { as: 'table', group: 'fcat' };
    const kinds = changePlan(plain(), draft, { boardName: () => undefined });
    expect(kinds).toEqual([
      { kind: 'skip', step: 'sfill', name: 'Completar', to: 'Triar', on: true },
      { kind: 'way_back', step: 'striage', name: 'Triar', to: 'Completar', you: true, on: true },
      { kind: 'way_back', step: 'sfix', name: 'Arreglar', to: 'Triar', you: false, on: true },
      { kind: 'note', step: 'sfix', name: 'Arreglar', on: true },
      {
        kind: 'waits',
        step: 'sfix',
        name: 'Arreglar',
        waits: ['parts', 'blockers'],
        board: 'Errores',
      },
      { kind: 'doer_drop', step: 'sfix', name: 'Arreglar', on: true },
      {
        kind: 'initial',
        part: 'fcat',
        partName: 'Categoría',
        partKind: 'choice',
        value: 'cgame',
        valueName: 'Juego',
      },
      { kind: 'guard', part: 'fbranch', partName: 'Rama', push: ['Arreglar'] },
      { kind: 'split', board: 'Errores', always: false },
      { kind: 'motives', names: ['Rechazado', 'Duplicado'] },
      { kind: 'drop_by', by: 'page' },
      { kind: 'list', as: 'table', group: 'Categoría' },
    ]);
  });

  it('names the board a split leads to, and says when a setting goes away', () => {
    const live = cambios();
    const draft = cambios();
    draft.steps = draft.steps.map((step) => ({ ...step, waits: [] }));
    delete draft.split;
    expect(
      changePlan(live, draft, { boardName: (id) => (id === 'brt' ? 'Tareas de repo' : undefined) }),
    ).toEqual([
      { kind: 'waits', step: 'sexec', name: 'Ejecutar', waits: [] },
      { kind: 'split', board: null, always: false },
    ]);
    const unsplit = cambios();
    delete unsplit.split;
    const split = changePlan(unsplit, live, {
      boardName: (id) => (id === 'brt' ? 'Tareas de repo' : undefined),
    });
    expect(split).toContainEqual({ kind: 'split', board: 'Tareas de repo', always: true });
  });
});

describe('itemEffects, the later settings', () => {
  it('names items a new wait holds and branches a new guard freezes', () => {
    const live = tareasDeRepo();
    delete live.parts.fbranch?.guard;
    const draft = tareasDeRepo();
    const effects = itemEffects(live, draft, [
      { id: 'RT-1', state: 'simpl__review' },
      { id: 'RT-2', state: 'simpl' },
    ]);
    expect(effects.frozen).toEqual([{ step: 'simpl', name: 'Implementar', items: ['RT-1'] }]);
    const waits = cambios();
    const before: BoardDefinition = {
      ...waits,
      steps: waits.steps.map((step: Step) => ({ ...step, waits: [] })),
    };
    const held = itemEffects(before, waits, [
      { id: 'CH-1', state: 'sexec', openParts: 2 },
      { id: 'CH-2', state: 'sexec', openParts: 0 },
      { id: 'CH-3', state: 'sanalyse', openParts: 1 },
    ]);
    expect(held.waiting).toEqual([
      { step: 'sexec', name: 'Ejecutar', wait: 'parts', items: ['CH-1'] },
    ]);
  });

  it('moves a discard whose motive goes away to plain Descartado', () => {
    const live = errores();
    const draft = errores();
    draft.drop = { ...draft.drop, motives: [{ id: 'rejected', name: 'Rechazado' }] };
    const result = itemMoves(live, draft, [{ id: 'BUG-1', state: 'dropped__duplicate' }], {});
    expect(result).toEqual({
      ok: true,
      moves: [{ id: 'BUG-1', from: 'dropped__duplicate', to: 'dropped' }],
    });
  });
});
