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
});
