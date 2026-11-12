import { describe, expect, it } from 'vitest';
import type { BoardDefinition, Step } from './model.ts';
import { problemsOf } from './problems.ts';
import { cambios, errores, tareasDeRepo } from './testing.ts';

const agents = [
  { name: 'mender', connected: true },
  { name: 'scout', connected: true },
];

const found = (def: BoardDefinition, more = {}) =>
  problemsOf(def, { agents, ...more }).map(({ level, code, params, at }) => ({
    level,
    code,
    params,
    at,
  }));

describe('problemsOf, the later settings', () => {
  it('finds nothing wrong with the boards that use every setting', () => {
    expect(found(errores())).toEqual([
      // A board with motives words what an agent that drops must do.
      {
        level: 'warning',
        code: 'motive_agent_drop',
        params: { step: 'Arreglar' },
        at: { kind: 'done' },
      },
    ]);
    const boards = [
      { id: 'bcam', name: 'Cambios', split: { board: 'brt', always: true } },
      { id: 'brt', name: 'Tareas de repo' },
    ];
    expect(found(cambios(), { id: 'bcam', boards })).toEqual([]);
    expect(found(tareasDeRepo(), { id: 'brt', boards })).toEqual([]);
  });

  it('blocks a wait for parts on a board that divides into nothing', () => {
    const def = cambios();
    delete def.split;
    expect(found(def)).toEqual([
      {
        level: 'error',
        code: 'wait_no_split',
        params: { step: 'Ejecutar', board: 'Cambios' },
        at: { kind: 'step', id: 'sexec' },
      },
    ]);
  });

  it('blocks skipping on creation anywhere but a first step nobody reviews', () => {
    const def = errores();
    def.steps[1] = { ...(def.steps[1] as Step), skipWhenReady: true };
    def.steps[0] = { ...(def.steps[0] as Step), reviewer: 'you' };
    expect(found(def).filter(({ code }) => code === 'skip_invalid')).toEqual([
      {
        level: 'error',
        code: 'skip_invalid',
        params: { step: 'Completar' },
        at: { kind: 'step', id: 'sfill' },
      },
      {
        level: 'error',
        code: 'skip_invalid',
        params: { step: 'Triar' },
        at: { kind: 'step', id: 'striage' },
      },
    ]);
  });

  it('blocks two boards that divide into each other', () => {
    const boards = [
      { id: 'bcam', name: 'Cambios', split: { board: 'brt', always: true } },
      { id: 'brt', name: 'Tareas de repo', split: { board: 'bcam', always: false } },
    ];
    const def = cambios();
    expect(found(def, { id: 'bcam', boards })).toEqual([
      {
        level: 'error',
        code: 'split_cycle',
        params: { board: 'Cambios', other: 'Tareas de repo' },
        at: { kind: 'about' },
      },
    ]);
    // The board itself (parts of the same kind) is no cycle.
    def.split = { board: 'same', always: false };
    expect(found(def, { id: 'bcam', boards })).toEqual([]);
  });

  it('blocks a split onto a board that does not exist, when the boards are known', () => {
    expect(found(cambios(), { id: 'bcam', boards: [{ id: 'bcam', name: 'Cambios' }] })).toEqual([
      {
        level: 'error',
        code: 'split_unknown',
        params: { board: 'Cambios' },
        at: { kind: 'about' },
      },
    ]);
  });

  it('blocks a protected branch that is pushed in no step', () => {
    const def = tareasDeRepo();
    def.parts.fbranch = { ...def.parts.fbranch!, guard: { push: ['sgone'] } };
    expect(found(def)).toEqual([
      {
        level: 'error',
        code: 'guard_no_push',
        params: { part: 'Rama' },
        at: { kind: 'form' },
      },
    ]);
  });

  it('blocks a start value that is not one of the field values', () => {
    const def = errores();
    def.parts.fcat = { ...def.parts.fcat!, initial: 'cgone' };
    def.anytime = ['fcat'];
    def.steps[1] = { ...(def.steps[1] as Step), hand: [] };
    expect(found(def).filter(({ code }) => code === 'initial_invalid')).toEqual([
      {
        level: 'error',
        code: 'initial_invalid',
        params: { part: 'Categoría' },
        at: { kind: 'anytime' },
      },
    ]);
  });
});
