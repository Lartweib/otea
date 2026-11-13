import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from './model.ts';
import { blocking, problemsOf } from './problems.ts';
import { creatures, step } from './testing.ts';

const codes = (def: BoardDefinition) =>
  problemsOf(def, {}).map(({ level, code }) => `${level}:${code}`);

describe('problemsOf', () => {
  it('finds nothing wrong with a sound board', () => {
    expect(problemsOf(creatures(), {})).toEqual([]);
  });

  it('blocks a board without a name or without steps', () => {
    const def = { ...creatures(), name: '  ', steps: [] };
    expect(codes(def)).toEqual(['error:board_unnamed', 'error:no_steps']);
  });

  it('blocks a name used twice in the board name space, at the second use', () => {
    const def = creatures();
    def.steps[1] = { ...(def.steps[1] ?? step('x', 'x')), name: 'arte conceptual ' };
    const found = problemsOf(def, {});
    expect(found).toEqual([
      {
        level: 'error',
        code: 'duplicate_name',
        params: { name: 'Arte conceptual', uses: ['evidence', 'step'] },
        at: { kind: 'step', id: 'sanimate' },
      },
    ]);
  });

  it('ignores parts nothing uses', () => {
    const def = creatures();
    def.parts.funused = { id: 'funused', name: 'Concepto', kind: 'text', hint: '', options: [] };
    expect(codes(def)).toEqual([]);
  });

  it('blocks unnamed steps and parts', () => {
    const def = creatures();
    def.steps[0] = { ...(def.steps[0] ?? step('x', 'x')), name: '' };
    def.parts.fdesc = {
      ...(def.parts.fdesc ?? { id: 'fdesc', kind: 'long', hint: '', options: [] }),
      name: '',
    };
    expect(codes(def)).toEqual(['error:step_unnamed', 'error:part_unnamed']);
  });

  it('warns about a reserved word as a step name', () => {
    const def = creatures();
    def.steps[2] = { ...(def.steps[2] ?? step('x', 'x')), name: 'Hecho' };
    expect(codes(def)).toEqual(['warning:reserved_name']);
  });

  it('blocks a "when" that reads something the item does not carry yet', () => {
    const def = creatures();
    const concept = def.steps[0] ?? step('x', 'x');
    def.form = [{ ref: 'fdesc', required: true }];
    expect(codes(def)).toEqual(['error:when_unreadable']);
    concept.hand[1] = { ref: 'eswamp', req: 'when', fresh: false };
    expect(problemsOf(def, {})[0]).toMatchObject({
      code: 'when_unreadable',
      at: { kind: 'part', id: 'eswamp', step: 'sconcept' },
    });
  });

  it('accepts a "when" reading a part filled at any time', () => {
    const def = creatures();
    def.form = [{ ref: 'fdesc', required: true }];
    def.anytime = ['fbiome'];
    expect(codes(def)).toEqual([]);
  });

  it('blocks a way to the step itself or to no step, and a send-back that goes forwards', () => {
    const def = creatures();
    const [concept, animate] = def.steps;
    if (!concept || !animate) throw new Error('fixture');
    animate.ways = ['sconcept'];
    expect(codes(def)).toEqual([]);
    animate.ways = ['sanimate', 'sgone'];
    concept.back = 'spolish';
    expect(codes(def)).toEqual(['error:way_invalid', 'error:way_invalid', 'error:back_invalid']);
  });

  it('blocks an agent closing an item as done: only you say something is Hecho', () => {
    const def = creatures();
    def.steps = [
      step('sa', 'Hacer', { reviewer: 'you' }),
      step('sb', 'Cerrar', { reviewer: 'none' }),
    ];
    expect(codes(def)).toEqual(['error:agent_closes']);
    def.steps = [
      step('sa', 'Hacer', { reviewer: 'any', ways: [] }),
      step('sb', 'Ver', { doer: 'you', reviewer: 'none' }),
    ];
    def.steps[0]?.ways.push('done');
    expect(codes(def)).toEqual(['error:agent_closes']);
  });

  it('warns when you review your own step', () => {
    const def = creatures();
    def.steps = [step('sa', 'Hacer', { doer: 'you', reviewer: 'you' })];
    expect(codes(def)).toEqual(['warning:self_review']);
  });

  it('blocks a handoff of a part that does not exist and a bad cap', () => {
    const def = creatures();
    def.steps[2]?.hand.push({ ref: 'fgone', req: 'always', fresh: false });
    def.cap = { on: true, n: 0 };
    expect(codes(def)).toEqual(['error:part_missing', 'error:cap_invalid']);
  });

  it('blocks a name another board of the project already has, whatever its case', () => {
    expect(problemsOf(creatures(), { takenNames: ['criaturas'] })).toEqual([
      {
        level: 'error',
        code: 'board_name_taken',
        params: { name: 'Criaturas' },
        at: { kind: 'about' },
      },
    ]);
  });

  it('says whether anything blocks publishing', () => {
    expect(blocking(problemsOf(creatures(), {}))).toBe(false);
    expect(blocking(problemsOf({ ...creatures(), steps: [] }, {}))).toBe(true);
  });
});
