import { describe, expect, it } from 'vitest';
import { parsePreset } from './preset.ts';
import { readSamples } from './samples.ts';
import { MIXED_YAML } from './testing.ts';

const preset = parsePreset(MIXED_YAML);

const SAMPLES = `
samples:
  - type: bug
    id: BUGS-1
    title: Wall-slide jump drops the buffered input
    state: reported
    fields: { severity: high, area: movement }
    evidence:
      - { file: before.png, role: before, module: images, caption: Frame 212 }
      - { file: after.png, role: after }
    relations:
      - { kind: blocks, id: WORK-2, title: Coyote time on moving platforms, state: todo }
    history:
      - { actor: agent, name: claude-a, event: created, ago: 2m }
`;

const FILES = ['before.png', 'after.png'];

describe('readSamples', () => {
  it('reads each sample with its fields, evidence, relations and history', () => {
    const { samples, notes } = readSamples(SAMPLES, preset, FILES);

    expect(notes).toEqual([]);
    expect(samples).toEqual([
      {
        type: 'bug',
        id: 'BUGS-1',
        title: 'Wall-slide jump drops the buffered input',
        state: 'reported',
        fields: { severity: 'high', area: 'movement' },
        evidence: [
          { file: 'before.png', role: 'before', module: 'images', caption: 'Frame 212' },
          { file: 'after.png', role: 'after' },
        ],
        relations: [
          { kind: 'blocks', id: 'WORK-2', title: 'Coyote time on moving platforms', state: 'todo' },
        ],
        history: [{ actor: 'agent', name: 'claude-a', event: 'created', ago: '2m' }],
      },
    ]);
  });

  it('fills the optional parts with empty lists and the only type', () => {
    const one = parsePreset(
      MIXED_YAML.replace(/types:[\s\S]*$/, 'types:\n  bug: { label: Bug }\n'),
    );
    const { samples } = readSamples(
      'samples:\n  - { id: B-1, title: A bug, state: reported }\n',
      one,
      [],
    );
    expect(samples).toEqual([
      {
        type: 'bug',
        id: 'B-1',
        title: 'A bug',
        state: 'reported',
        fields: {},
        evidence: [],
        relations: [],
        history: [],
      },
    ]);
  });

  it('reads no samples, and notes nothing, from an empty or missing file', () => {
    expect(readSamples(undefined, preset, [])).toEqual({ samples: [], notes: [] });
    expect(readSamples('', preset, [])).toEqual({ samples: [], notes: [] });
  });

  it('notes invalid YAML and drops nothing else', () => {
    expect(readSamples('samples: [', preset, []).notes).toEqual([
      expect.objectContaining({ code: 'sample_invalid', path: { section: 'samples' } }),
    ]);
  });

  it('drops a sample with an unknown key and notes it by its index', () => {
    const { samples, notes } = readSamples(
      'samples:\n  - { type: bug, id: B-1, title: A, state: reported, colour: red }\n',
      preset,
      [],
    );
    expect(samples).toEqual([]);
    expect(notes).toEqual([
      {
        code: 'sample_invalid',
        level: 'warning',
        message: expect.stringContaining('samples[0]'),
        path: { section: 'samples', index: 0 },
      },
    ]);
  });

  it('drops a sample of an unknown type', () => {
    const { samples, notes } = readSamples(
      'samples:\n  - { type: epic, id: E-1, title: A, state: reported }\n',
      preset,
      [],
    );
    expect(samples).toEqual([]);
    expect(notes).toEqual([
      {
        code: 'sample_unknown_type',
        level: 'warning',
        message: 'samples[0].type: unknown type "epic" (types: bug, impr)',
        path: { section: 'samples', index: 0, type: 'epic' },
      },
    ]);
  });

  it('moves a sample in a state its workflow lacks to the initial state, with a note', () => {
    const { samples, notes } = readSamples(
      'samples:\n  - { type: impr, id: I-1, title: A, state: reported }\n',
      preset,
      [],
    );
    expect(samples[0]?.state).toBe('idea');
    expect(notes).toEqual([
      {
        code: 'sample_unknown_state',
        level: 'warning',
        message:
          'samples[0].state: "reported" is not a state of impr (states: draft, idea, planned, dropped); drawn as idea',
        path: { section: 'samples', index: 0, type: 'impr', state: 'reported' },
      },
    ]);
  });

  it('keeps a value of an unknown field, drawn as plain text, and notes it', () => {
    const { samples, notes } = readSamples(
      'samples:\n  - { type: bug, id: B-1, title: A, state: reported, fields: { build_hash: abc } }\n',
      preset,
      [],
    );
    expect(samples[0]?.fields).toEqual({ build_hash: 'abc' });
    expect(notes).toEqual([
      {
        code: 'sample_unknown_field',
        level: 'warning',
        message: 'samples[0].fields.build_hash: bug has no field "build_hash"',
        path: { section: 'samples', index: 0, type: 'bug', field: 'build_hash' },
      },
    ]);
  });

  it('notes a value its field does not allow', () => {
    const { notes } = readSamples(
      'samples:\n  - { type: bug, id: B-1, title: A, state: reported, fields: { severity: huge } }\n',
      preset,
      [],
    );
    expect(notes).toEqual([
      {
        code: 'sample_invalid_value',
        level: 'warning',
        message:
          'samples[0].fields.severity: field "severity" must be one of low, medium, high, critical',
        path: { section: 'samples', index: 0, type: 'bug', field: 'severity' },
      },
    ]);
  });

  it('drops evidence whose file the samples folder lacks, and notes it', () => {
    const { samples, notes } = readSamples(SAMPLES, preset, ['before.png']);
    expect(samples[0]?.evidence).toEqual([
      { file: 'before.png', role: 'before', module: 'images', caption: 'Frame 212' },
    ]);
    expect(notes).toEqual([
      {
        code: 'sample_missing_file',
        level: 'warning',
        message: 'samples[0].evidence[1].file: samples/after.png does not exist',
        path: { section: 'samples', index: 0, file: 'after.png' },
      },
    ]);
  });

  it('refuses a file name that leaves the samples folder', () => {
    const { notes } = readSamples(
      'samples:\n  - { type: bug, id: B-1, title: A, state: reported, evidence: [{ file: ../preset.yaml }] }\n',
      preset,
      [],
    );
    expect(notes).toEqual([expect.objectContaining({ code: 'sample_invalid' })]);
  });
});
