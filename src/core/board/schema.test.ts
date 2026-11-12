import { describe, expect, it } from 'vitest';
import type { Part, Step } from './model.ts';
import { parseDefinition } from './schema.ts';
import { creatures } from './testing.ts';

describe('parseDefinition', () => {
  it('reads a sound definition back as it was', () => {
    expect(parseDefinition(JSON.parse(JSON.stringify(creatures())))).toEqual({
      ok: true,
      definition: creatures(),
    });
  });

  it('refuses a malformed one with where and why, never a stack', () => {
    const bad = { ...creatures(), steps: [{ id: 'Not An Id', name: 'x' }] };
    const result = parseDefinition(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/^steps\.0\./);
  });

  it('refuses an unknown part kind and a zone that does not exist', () => {
    const def = creatures();
    const kinds = parseDefinition({
      ...def,
      parts: { fx: { ...def.parts.fdesc, id: 'fx', kind: 'poem' } },
    });
    expect(kinds.ok).toBe(false);
    const zones = parseDefinition({ ...def, layout: { fdesc: 'footer' } });
    expect(zones.ok).toBe(false);
  });

  it('refuses a part filed under another id', () => {
    const def = creatures();
    const result = parseDefinition({ ...def, parts: { fother: def.parts.fdesc } });
    expect(result).toEqual({
      ok: false,
      problems: ['parts.fother: the part says its id is fdesc'],
    });
  });

  it('refuses step ids the engine reserves or cannot read back, and duplicates', () => {
    const def = creatures();
    const [first, second] = def.steps as [(typeof def.steps)[0], (typeof def.steps)[0]];
    const withStep = (id: string) =>
      parseDefinition({ ...def, steps: [{ ...first, id }, ...def.steps.slice(1)] });
    for (const id of ['done', 'dropped', 'same', 'title', 'a__review', 'a__yours']) {
      const result = withStep(id);
      expect(result.ok, id).toBe(false);
      if (!result.ok) expect(result.problems[0]).toMatch(/^steps\.0\.id: /);
    }
    const twice = parseDefinition({ ...def, steps: [first, { ...second, id: first.id }] });
    expect(twice).toEqual({
      ok: false,
      problems: ['steps.1.id: another step already has the id sconcept'],
    });
  });

  it('refuses a part with the id of the title', () => {
    const def = creatures();
    const result = parseDefinition({
      ...def,
      parts: { ...def.parts, title: { ...def.parts.fdesc, id: 'title' } },
    });
    expect(result.ok).toBe(false);
  });

  it('words what a step doer or reviewer must be', () => {
    const def = creatures();
    const [first] = def.steps;
    const result = parseDefinition({ ...def, steps: [{ ...first, doer: 'kiln' }] });
    expect(result).toEqual({
      ok: false,
      problems: ['steps.0.doer: who does the step: "you", "any" or {"agent": "<name>"}'],
    });
  });

  it('reads a version 1 definition with every later setting at its default', () => {
    const def = creatures();
    const { drop: _drop, list: _list, ...older } = def;
    const v1 = {
      ...older,
      schema: 1,
      steps: def.steps.map(
        ({ note: _n, waits: _w, skipWhenReady: _s, doerMayDrop: _d, ...step }) => step,
      ),
    };
    expect(parseDefinition(JSON.parse(JSON.stringify(v1)))).toEqual({ ok: true, definition: def });
  });

  it('reads back every capability a board can say', () => {
    const def = creatures();
    def.parts.fbranch = {
      id: 'fbranch',
      name: 'Rama',
      kind: 'branch',
      hint: '',
      options: [],
      guard: { push: ['sanimate'], repo: 'fdesc' },
    };
    def.parts.fbiome = { ...(def.parts.fbiome as Part), initial: 'cswamp' };
    def.steps[0] = {
      ...(def.steps[0] as Step),
      note: { req: 'always', hint: 'qué cambió' },
      waits: ['parts', 'blockers'],
      skipWhenReady: true,
      doerMayDrop: true,
    };
    def.split = { board: 'bother', always: true };
    def.drop = { by: 'page', motives: [{ id: 'wont_fix', name: 'No se arreglará' }] };
    def.list = { as: 'table', group: 'fbiome' };
    def.layout = { ...def.layout, rounds: 'main', parts: 'side' };
    expect(parseDefinition(JSON.parse(JSON.stringify(def)))).toEqual({ ok: true, definition: def });
  });

  it('refuses a motive id a closed state cannot carry, and places as part ids', () => {
    const def = creatures();
    const motive = parseDefinition({
      ...def,
      drop: { by: 'anyone', motives: [{ id: 'won-t-fix', name: 'No' }] },
    });
    expect(motive.ok).toBe(false);
    if (!motive.ok) expect(motive.problems[0]).toMatch(/^drop\.motives\.0\.id: /);
    for (const id of ['rounds', 'parts']) {
      const result = parseDefinition({
        ...def,
        parts: { ...def.parts, [id]: { ...def.parts.fdesc, id } },
      });
      expect(result.ok, id).toBe(false);
    }
  });

  it('refuses an unknown wait and a guard on a field that is not a branch', () => {
    const def = creatures();
    const [first] = def.steps;
    const wait = parseDefinition({ ...def, steps: [{ ...first, waits: ['children'] }] });
    expect(wait.ok).toBe(false);
    const guard = parseDefinition({
      ...def,
      parts: { ...def.parts, fdesc: { ...def.parts.fdesc, guard: { push: [] } } },
    });
    expect(guard).toEqual({
      ok: false,
      problems: ['parts.fdesc.guard: only a branch field is protected'],
    });
  });
});
