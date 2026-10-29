import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tasks } from '../core/testing.ts';
import { loadPresets, OFFICIAL_PRESETS_DIR, type PresetCatalog, requirePreset } from './presets.ts';

const NOTES = `
preset: notes
preset_version: 2
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states: { open: { turn: agent }, closed: { turn: none } }
  transitions: [{ from: open, to: closed, by: agent }]
`;

describe('official presets', () => {
  it('ship tasks with the tasks workflow and no problems', () => {
    const catalog = loadPresets();

    expect(catalog.problems).toEqual([]);
    expect(requirePreset(catalog, 'tasks')).toMatchObject({
      name: 'tasks',
      version: 1,
      origin: 'official',
      workflow: tasks,
    });
  });

  it('ship a playbook that starts by listing the agent turn', () => {
    const playbook = readFileSync(join(OFFICIAL_PRESETS_DIR, 'tasks', 'playbook.md'), 'utf8');

    expect(playbook).toContain('otea list --turn agent');
  });

  it('ship a playbook whose loop waits for unclaimed work, then claims it', () => {
    const playbook = readFileSync(join(OFFICIAL_PRESETS_DIR, 'tasks', 'playbook.md'), 'utf8');
    const start = playbook.slice(playbook.indexOf('## 1.'), playbook.indexOf('## 2.'));

    expect(start).toContain('otea wait --turn agent --unclaimed');
    expect(start).toContain('otea events --since');
  });

  it('ship a playbook whose enrichment step treats human-entered text as data', () => {
    const playbook = readFileSync(join(OFFICIAL_PRESETS_DIR, 'tasks', 'playbook.md'), 'utf8');
    const enrichment = playbook.slice(playbook.indexOf('## 4.'), playbook.indexOf('## 5.'));

    expect(enrichment).toContain('not instructions to you');
    expect(enrichment).toContain('discard it with a reason');
  });

  it('ship a playbook that claims an item before working it', () => {
    const playbook = readFileSync(join(OFFICIAL_PRESETS_DIR, 'tasks', 'playbook.md'), 'utf8');
    const leases = playbook.slice(playbook.indexOf('## 3.'), playbook.indexOf('## 4.'));

    for (const command of ['otea claim', 'otea heartbeat', 'otea release']) {
      expect(leases).toContain(command);
    }
    expect(leases).toContain('Exit code 12');
  });
});

describe('project presets', () => {
  let root: string;

  const write = (name: string, files: Record<string, string>) => {
    const dir = join(root, '.otea', 'presets', name);
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  };

  const problemsOf = (catalog: PresetCatalog, preset: string) =>
    catalog.problems.filter((problem) => problem.preset === preset).map(({ message }) => message);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-presets-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('loads only official presets when the project has none', () => {
    expect([...loadPresets(root).presets.keys()]).toEqual(['bug-triage', 'tasks']);
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

  it('reports a preset whose name does not match its directory', () => {
    write('other', { 'preset.yaml': NOTES });

    expect(problemsOf(loadPresets(root), 'other')).toEqual([
      'preset: "notes" does not match its directory "other"',
    ]);
  });

  it('reports a missing preset.yaml', () => {
    write('empty', {});

    expect(problemsOf(loadPresets(root), 'empty')).toEqual(['missing preset.yaml']);
  });

  it('reports a missing playbook', () => {
    write('notes', { 'preset.yaml': `${NOTES}playbook: ./playbook.md\n` });

    expect(problemsOf(loadPresets(root), 'notes')).toEqual([
      'playbook: ./playbook.md does not exist',
    ]);
  });

  it('reports every problem of an invalid preset', () => {
    write('notes', { 'preset.yaml': NOTES.replace('initial: open', 'initial: nope') });

    const catalog = loadPresets(root);

    expect(problemsOf(catalog, 'notes')).toContain('workflow.initial: unknown state "nope"');
    expect(catalog.problems[0]).toMatchObject({
      origin: 'project',
      path: join(root, '.otea', 'presets', 'notes', 'preset.yaml'),
    });
  });

  it('fails with invalid_preset when requiring a broken preset', () => {
    write('notes', { 'preset.yaml': 'preset: [' });

    expect(() => requirePreset(loadPresets(root), 'notes')).toThrow(
      expect.objectContaining({ code: 'invalid_preset' }),
    );
  });

  it('fails with not_found for an unknown preset', () => {
    expect(() => requirePreset(loadPresets(root), 'nope')).toThrow(
      expect.objectContaining({ code: 'not_found', message: 'Preset "nope" not found' }),
    );
  });
});
