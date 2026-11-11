import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { parsePreset, readPreset } from './preset.ts';
import { MIXED_YAML } from './testing.ts';

// biome-ignore lint/suspicious/noExplicitAny: fixtures are arbitrary YAML documents mutated per case
type Raw = Record<string, any>;

// The mixed preset in Spanish: bug follows the preset's workflow, impr its own.
function mixed(): Raw {
  const raw = parse(MIXED_YAML) as Raw;
  raw.labels = {
    es: {
      types: { bug: 'Error', impr: 'Mejora' },
      states: {
        reported: 'reportado',
        fixing: 'en arreglo',
        fixed: 'arreglado',
        rejected: 'rechazado',
        ...Object.fromEntries(
          Object.keys(raw.types.impr.workflow.states).map((name) => [name, `es:${name}`]),
        ),
      },
      fields: { title: 'título', area: 'área', severity: 'gravedad', pitch: 'propuesta' },
    },
  };
  return raw;
}

function problemsOf(change: (raw: Raw) => void): string[] {
  const raw = mixed();
  change(raw);
  const result = readPreset(stringify(raw));
  return result.ok ? [] : result.problems;
}

describe('preset labels', () => {
  it('gives each type its own words in each language: its label, its states and its fields', () => {
    const preset = parsePreset(stringify(mixed()));
    const [bug, impr] = preset.types;

    expect(bug?.labels).toEqual({
      es: {
        label: 'Error',
        states: {
          reported: 'reportado',
          fixing: 'en arreglo',
          fixed: 'arreglado',
          rejected: 'rechazado',
        },
        fields: { title: 'título', area: 'área', severity: 'gravedad' },
      },
    });
    expect(impr?.labels?.es?.label).toBe('Mejora');
    expect(Object.keys(impr?.labels?.es?.states ?? {})).toEqual(
      impr?.workflow.states.map(({ name }) => name),
    );
    expect(impr?.labels?.es?.fields).toEqual({ title: 'título', area: 'área', pitch: 'propuesta' });
  });

  it('leaves a preset without labels as it was', () => {
    const raw = mixed();
    delete raw.labels;

    expect(parsePreset(stringify(raw)).types.every(({ labels }) => labels === undefined)).toBe(
      true,
    );
  });

  it.each<[string, (raw: Raw) => void, string]>([
    [
      'an unknown type',
      (raw) => (raw.labels.es.types.epic = 'Épica'),
      'labels.es.types.epic: unknown type "epic"',
    ],
    [
      'an unknown state',
      (raw) => (raw.labels.es.states.parked = 'aparcado'),
      'labels.es.states.parked: unknown state "parked"',
    ],
    [
      'an unknown field',
      (raw) => (raw.labels.es.fields.owner = 'dueño'),
      'labels.es.fields.owner: unknown field "owner"',
    ],
    [
      'a missing state, since a language labels all of a preset or none of it',
      (raw) => delete raw.labels.es.states.fixing,
      'labels.es.states: missing fixing; a language labels every type, state and field',
    ],
    [
      'missing types',
      (raw) => delete raw.labels.es.types,
      'labels.es.types: missing bug, impr; a language labels every type, state and field',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(problemsOf(change)).toEqual([problem]);
  });

  it('rejects a language that is not a language code, and an empty label', () => {
    expect(
      problemsOf((raw) => {
        raw.labels.Spanish = raw.labels.es;
      }),
    ).toEqual([expect.stringContaining('labels.Spanish')]);
    expect(problemsOf((raw) => (raw.labels.es.types.bug = ' '))).toEqual([
      expect.stringContaining('labels.es.types.bug'),
    ]);
  });

  it('labels the only type of a preset without types by its states and fields alone', () => {
    const raw: Raw = {
      preset: 'notes',
      preset_version: 1,
      fields: { title: { module: 'text', required: 'create' } },
      workflow: {
        initial: 'open',
        states: { open: { turn: 'agent' }, closed: { turn: 'none', closes: 'discarded' } },
        transitions: [{ from: 'open', to: 'closed', by: 'agent' }],
      },
      labels: {
        es: { states: { open: 'abierta', closed: 'cerrada' }, fields: { title: 'título' } },
      },
    };

    expect(parsePreset(stringify(raw)).types[0]?.labels).toEqual({
      es: { states: { open: 'abierta', closed: 'cerrada' }, fields: { title: 'título' } },
    });
  });

  it('gives a field its values in words, and the preset its name', () => {
    const raw = mixed();
    raw.labels.es.name = 'Errores';
    raw.labels.es.values = { severity: { high: 'alta' } };
    const preset = parsePreset(stringify(raw));
    const [bug, impr] = preset.types;

    expect(preset.names).toEqual({ es: 'Errores' });
    expect(bug?.labels?.es?.values).toEqual({ severity: { high: 'alta' } });
    expect(impr?.labels?.es?.values).toBeUndefined();
  });

  it('rejects values of an unknown field', () => {
    expect(problemsOf((raw) => (raw.labels.es.values = { owner: { me: 'yo' } }))).toEqual([
      'labels.es.values.owner: unknown field "owner"',
    ]);
  });

  const official = ['tasks', 'change', 'bug-triage', 'review', 'architecture'];
  it.each(official.flatMap((name) => ['es', 'en'].map((lang) => [name, lang])))(
    'the official %s preset speaks %s, with a name and capitalised steps',
    (name, lang) => {
      const text = readFileSync(
        new URL(`../../presets/${name}/preset.yaml`, import.meta.url),
        'utf8',
      );
      const preset = parsePreset(text);

      expect(preset.names?.[lang]).toBeTruthy();
      for (const type of preset.types) {
        const words = type.labels?.[lang];
        expect(words?.label, type.name).toBeTruthy();
        expect(Object.keys(words?.states ?? {})).toHaveLength(type.workflow.states.length);
        for (const word of Object.values(words?.states ?? {}))
          expect(word[0], word).toBe(word[0]?.toLocaleUpperCase());
        for (const [field, spec] of Object.entries(type.fields))
          for (const value of spec.values ?? [])
            expect(words?.values?.[field]?.[value], `${field}.${value}`).toBeTruthy();
      }
    },
  );
});
