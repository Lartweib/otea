import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCollection } from '../store/queries.ts';
import { applyBlueprint } from './blueprints.ts';
import { insertNewCollection } from './collections.ts';
import { loadPresets } from './presets.ts';
import { customizeBoard, customizePreset, readPresetSource, revertBoard } from './studio.ts';
import { memoryContext, projectOf } from './testing.ts';

describe('customizing a board', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-customize-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const bare = () => {
    const ctx = memoryContext();
    const project = projectOf(root, { ...ctx, presets: loadPresets(join(root, '.otea')) });
    mkdirSync(project.dataDir, { recursive: true });
    insertNewCollection(project, { name: 'bugs', preset: 'bug-triage' });
    insertNewCollection(project, { name: 'crashes', preset: 'bug-triage' });
    return project;
  };
  const yamlOf = (project: ReturnType<typeof bare>, name = 'bug-triage') =>
    readPresetSource(project, name).yaml;

  it('works from the collection when the project has no blueprint, and reverts', () => {
    const project = bare();

    const done = customizeBoard(project, 'bugs', yamlOf(project));

    expect(done.preset).toBe('bugs-bug-triage');
    expect(findCollection(project.db, 'bugs')?.preset).toBe('bugs-bug-triage');
    expect(findCollection(project.db, 'crashes')?.preset).toBe('bug-triage');

    revertBoard(project, 'bugs', done.previous);
    expect(findCollection(project.db, 'bugs')?.preset).toBe('bug-triage');
    project.db.close();
  });

  it('names the copy by a lowercase form of a board named with capitals or accents', () => {
    const project = bare();
    insertNewCollection(project, { name: 'Tareas Ñandú', preset: 'tasks' });

    const done = customizeBoard(project, 'Tareas Ñandú', yamlOf(project, 'tasks'));

    expect(done.preset).toBe('tareas-nandu-tasks');
    expect(findCollection(project.db, 'Tareas Ñandú')?.preset).toBe('tareas-nandu-tasks');
    project.db.close();
  });

  it('refuses a board that is not a collection', () => {
    const project = bare();
    expect(() => customizeBoard(project, 'nope', yamlOf(project))).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    project.db.close();
  });

  it('customizes a preset for every board that uses it, or saves a copy when none does', () => {
    const project = bare();

    const all = customizePreset(project, 'bug-triage', yamlOf(project));
    expect(all.boards.map(({ board }) => board)).toEqual(['bugs', 'crashes']);
    expect(findCollection(project.db, 'crashes')?.preset).toBe('crashes-bug-triage');

    const unused = customizePreset(project, 'tasks', yamlOf(project, 'tasks'));
    expect(unused.boards).toEqual([]);
    expect(unused.preset).toBe('tasks-copy');
    expect(readPresetSource(project, 'tasks-copy').origin).toBe('project');
    project.db.close();
  });

  it('keeps the blueprint copy pointing at the board copy', () => {
    const project = projectOf(root, memoryContext());
    mkdirSync(project.dataDir, { recursive: true });
    applyBlueprint(project, 'product', root);

    const done = customizeBoard(project, 'bugs', readPresetSource(project, 'bug-triage').yaml);

    expect(project.blueprint?.boards).toContainEqual({ name: 'bugs', preset: done.preset });
    expect(readFileSync(join(project.dataDir, 'blueprint.yaml'), 'utf8')).toContain(done.preset);
    project.db.close();
  });
});
