import { describe, expect, it } from 'vitest';
import {
  defaultAxes,
  fitsRole,
  mappedScales,
  partsFor,
  rolePart,
  scaleOf,
  stepOf,
  viewsOf,
} from './analysis.ts';
import type { BoardDefinition, Part } from './model.ts';
import { problemsOf as allProblems } from './problems.ts';
import { parseDefinition } from './schema.ts';
import { errores } from './testing.ts';

// Errores with an effort (a choice S, M, L), a risk (a level) and an area (a short text), all filled
// at Triar.
function triage(): BoardDefinition {
  const def = errores();
  def.parts.feffort = {
    id: 'feffort',
    name: 'Esfuerzo',
    kind: 'choice',
    hint: '',
    options: [
      { id: 'cs', name: 'S' },
      { id: 'cm', name: 'M' },
      { id: 'cl', name: 'L' },
    ],
  };
  def.parts.frisk = { id: 'frisk', name: 'Riesgo', kind: 'level', hint: '', options: [] };
  def.parts.farea = { id: 'farea', name: 'Zona', kind: 'text', hint: '', options: [] };
  const triar = def.steps[1];
  if (triar)
    triar.hand.push(
      { ref: 'feffort', req: 'no', fresh: false },
      { ref: 'frisk', req: 'no', fresh: false },
      { ref: 'farea', req: 'no', fresh: false },
    );
  return def;
}

// The fixture's own warning (an agent may drop without a motive) is not what these tests read.
const problemsOf = (def: BoardDefinition, ctx: object) => allProblems(def, ctx);

const part = (kind: Part['kind']): Part => ({ id: 'f', name: 'F', kind, hint: '', options: [] });

describe('analysis roles', () => {
  it('reads a scale from a level, a number or a choice, never from a long text', () => {
    expect(fitsRole('effort', part('choice'))).toBe(true);
    expect(fitsRole('risk', part('level'))).toBe(true);
    expect(fitsRole('impact', part('number'))).toBe(true);
    expect(fitsRole('effort', part('long'))).toBe(false);
    expect(fitsRole('area', part('text'))).toBe(true);
    expect(fitsRole('due', part('date'))).toBe(true);
    expect(fitsRole('due', part('text'))).toBe(false);
  });

  it('offers for each role only the fields that fit it', () => {
    expect(partsFor(triage(), 'effort').map(({ id }) => id)).toEqual(['fcat', 'feffort', 'frisk']);
    expect(partsFor(triage(), 'due')).toEqual([]);
  });

  it('turns the matrix on only once two scale roles are mapped', () => {
    const def = triage();
    expect(viewsOf(def)).toEqual([]);
    def.analysis = { effort: 'feffort' };
    expect(viewsOf(def)).toEqual([]);
    def.analysis = { effort: 'feffort', risk: 'frisk', area: 'farea' };
    expect(viewsOf(def)).toEqual(['matrix']);
    expect(mappedScales(def)).toEqual(['effort', 'risk']);
    expect(defaultAxes(def)).toEqual({ x: 'effort', y: 'risk' });
  });

  it('ignores a role mapped to a field that no longer fits it', () => {
    const def = triage();
    def.analysis = { effort: 'fsteps', risk: 'frisk' };
    expect(rolePart(def, 'effort')).toBeUndefined();
    expect(viewsOf(def)).toEqual([]);
  });

  it('puts effort across and the other mapped scale up when risk is missing', () => {
    const def = triage();
    def.analysis = { impact: 'frisk', effort: 'feffort' };
    expect(defaultAxes(def)).toEqual({ x: 'effort', y: 'impact' });
  });

  it('reads a choice scale in its options order, a level low to critical, numbers sorted', () => {
    const def = triage();
    expect(scaleOf(def.parts.feffort as Part).map(({ value }) => value)).toEqual([
      'cs',
      'cm',
      'cl',
    ]);
    expect(scaleOf(def.parts.frisk as Part).map(({ value }) => value)).toEqual([
      'low',
      'medium',
      'high',
      'critical',
    ]);
    const steps = scaleOf(part('number'), ['8', '2', '', '5', '2']);
    expect(steps.map(({ value }) => value)).toEqual(['2', '5', '8']);
    expect(stepOf(steps, '5')).toBe(1);
    expect(stepOf(steps, '5.0')).toBe(1);
    expect(stepOf(steps, '')).toBeUndefined();
    expect(stepOf(steps, undefined)).toBeUndefined();
  });
});

describe('analysis problems', () => {
  it('finds nothing wrong with sound roles', () => {
    const def = triage();
    def.analysis = { effort: 'feffort', risk: 'frisk', area: 'farea' };
    expect(problemsOf(def, {})).toEqual([]);
  });

  it('blocks a role on a field the board lacks or does not use', () => {
    const def = triage();
    def.parts.funused = { id: 'funused', name: 'Suelto', kind: 'level', hint: '', options: [] };
    def.analysis = { effort: 'fgone', risk: 'funused' };
    expect(problemsOf(def, {})).toEqual([
      {
        level: 'error',
        code: 'analysis_missing',
        params: { role: 'effort' },
        at: { kind: 'about' },
      },
      { level: 'error', code: 'analysis_missing', params: { role: 'risk' }, at: { kind: 'about' } },
    ]);
  });

  it('blocks a role on a field of a kind it cannot read, naming the field', () => {
    const def = triage();
    def.analysis = { due: 'farea' };
    expect(problemsOf(def, {})).toEqual([
      {
        level: 'error',
        code: 'analysis_kind',
        params: { role: 'due', part: 'Zona' },
        at: { kind: 'about' },
      },
    ]);
  });

  it('reads and keeps the analysis block of a board.json, and refuses an unknown role', () => {
    const def = { ...triage(), analysis: { effort: 'feffort', risk: 'frisk' } };
    const read = parseDefinition(JSON.parse(JSON.stringify(def)));
    expect(read.ok && read.definition.analysis).toEqual({ effort: 'feffort', risk: 'frisk' });
    const bad = parseDefinition({ ...def, analysis: { cost: 'feffort' } });
    expect(bad.ok).toBe(false);
  });
});
