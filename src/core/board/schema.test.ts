import { describe, expect, it } from 'vitest';
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
});
