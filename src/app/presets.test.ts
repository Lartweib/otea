import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tasks } from '../core/testing.ts';
import { loadPresets, type PresetCatalog, requirePreset } from './presets.ts';

const NOTES = `
preset: notes
preset_version: 2
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states: { open: { turn: agent }, closed: { turn: none, closes: discarded } }
  transitions: [{ from: open, to: closed, by: agent }]
`;

describe('official presets', () => {
  it('ship tasks with the tasks workflow and no problems', () => {
    const catalog = loadPresets();

    expect(catalog.problems).toEqual([]);
    expect(requirePreset(catalog, 'tasks')).toMatchObject({
      name: 'tasks',
      version: 2,
      origin: 'official',
      workflow: tasks,
    });
  });

  it('ship samples that fit them, each evidence file in its samples folder', () => {
    const catalog = loadPresets();
    const notes = catalog.warnings.filter(({ code }) => code?.startsWith('sample_'));

    expect(notes).toEqual([]);
  });
});

describe('project presets', () => {
  let root: string;

  const write = (name: string, files: Record<string, string>) => {
    const dir = join(root, 'presets', name);
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  };

  // The notes of the project's presets, without the official ones'.
  const own = (catalog: PresetCatalog) =>
    catalog.warnings.filter(({ origin }) => origin === 'project');

  const problemsOf = (catalog: PresetCatalog, preset: string) =>
    catalog.problems.filter((problem) => problem.preset === preset).map(({ message }) => message);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-presets-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('loads only official presets when the project has none', () => {
    expect([...loadPresets(root).presets.keys()]).toEqual([
      'architecture',
      'bug-triage',
      'change',
      'review',
      'tasks',
    ]);
  });

  it('loads a valid project preset next to the official ones', () => {
    write('notes', { 'preset.yaml': NOTES });

    const catalog = loadPresets(root);

    expect(catalog.problems).toEqual([]);
    expect(requirePreset(catalog, 'notes')).toMatchObject({ version: 2, origin: 'project' });
  });

  it('reports a project preset that reuses an official name and keeps the official one', () => {
    write('tasks', { 'preset.yaml': NOTES.replace('preset: notes', 'preset: tasks') });

    const catalog = loadPresets(root);

    expect(problemsOf(catalog, 'tasks')).toEqual([
      '"tasks" is an official preset name; rename the project preset',
    ]);
    expect(requirePreset(catalog, 'tasks').origin).toBe('official');
  });

  it.each<[string, string, Record<string, string>, string]>([
    [
      'a name unlike its directory',
      'other',
      { 'preset.yaml': NOTES },
      'preset: "notes" does not match its directory "other"',
    ],
    ['a missing preset.yaml', 'empty', {}, 'missing preset.yaml'],
    [
      'a missing playbook',
      'notes',
      {
        'preset.yaml': `${NOTES}playbook: ./playbook.md
`,
      },
      'playbook: ./playbook.md does not exist',
    ],
    [
      'a missing playbook of a type',
      'notes',
      {
        'preset.yaml': `${NOTES}types:
  note: { label: Note, playbook: ./note.md }
`,
      },
      'types.note.playbook: ./note.md does not exist',
    ],
  ])('reports %s', (_, dir, files, problem) => {
    write(dir, files);

    expect(problemsOf(loadPresets(root), dir)).toEqual([problem]);
  });

  it('reports every problem of an invalid preset', () => {
    write('notes', { 'preset.yaml': NOTES.replace('initial: open', 'initial: nope') });

    const catalog = loadPresets(root);

    expect(problemsOf(catalog, 'notes')).toContain('workflow.initial: unknown state "nope"');
    expect(catalog.problems[0]).toMatchObject({
      origin: 'project',
      path: join(root, 'presets', 'notes', 'preset.yaml'),
    });
  });

  it('fails with invalid_preset when requiring a broken preset', () => {
    write('notes', { 'preset.yaml': 'preset: [' });

    expect(() => requirePreset(loadPresets(root), 'notes')).toThrow(
      expect.objectContaining({ code: 'invalid_preset' }),
    );
  });

  describe('notes', () => {
    it('carries each note with its code, level and path', () => {
      const yaml = NOTES.replace(
        'open: { turn: agent }',
        'open: { turn: agent, close_requires: children_closed }',
      );
      write('notes', { 'preset.yaml': yaml });

      expect(own(loadPresets(root))).toEqual([
        {
          preset: 'notes',
          origin: 'project',
          path: join(root, 'presets', 'notes', 'preset.yaml'),
          code: 'deprecated_key',
          level: 'warning',
          at: { section: 'states', state: 'open' },
          message: expect.stringContaining('workflow.states.open.close_requires: deprecated'),
        },
      ]);
    });

    it('notes what its samples get wrong, against the samples file', () => {
      const samples = 'samples:\n  - { id: N-1, title: A note, state: nowhere }\n';
      write('notes', { 'preset.yaml': NOTES, 'samples.yaml': samples });

      expect(own(loadPresets(root))).toEqual([
        expect.objectContaining({
          preset: 'notes',
          path: join(root, 'presets', 'notes', 'samples.yaml'),
          code: 'sample_unknown_state',
          at: { section: 'samples', index: 0, type: 'item', state: 'nowhere' },
        }),
      ]);
    });

    it('never stops a preset loading over its samples', () => {
      write('notes', { 'preset.yaml': NOTES, 'samples.yaml': 'samples: [' });

      const catalog = loadPresets(root);
      expect(catalog.problems).toEqual([]);
      expect(catalog.presets.has('notes')).toBe(true);
    });
  });
});
