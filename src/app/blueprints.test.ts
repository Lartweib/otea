import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCollection, selectItems } from '../store/queries.ts';
import { applyBlueprint, blueprintFindings, loadBlueprints, pointBoardAt } from './blueprints.ts';
import { createItem } from './items.ts';
import { loadPresets } from './presets.ts';
import { copyBoardPreset, listStudioBlueprints } from './studio.ts';
import { memoryContext, projectOf } from './testing.ts';

const STUDIO = `
blueprint: studio
blueprint_version: 1
boards:
  work: { preset: tasks }
  bugs: { preset: bug-triage }
connections:
  - bugs.bug blocks work.task
`;

describe('official blueprints', () => {
  it('ship product, built from official presets, with no problems', () => {
    const catalog = loadBlueprints(loadPresets());

    expect(catalog.problems).toEqual([]);
    expect(catalog.blueprints.get('product')).toMatchObject({
      name: 'product',
      origin: 'official',
      boards: [
        { name: 'work', preset: 'tasks' },
        { name: 'bugs', preset: 'bug-triage' },
      ],
      connections: [
        {
          kind: 'blocks',
          from: { board: 'bugs', type: 'bug' },
          to: { board: 'work', type: 'task' },
        },
      ],
    });
  });
});

describe('project blueprints', () => {
  let root: string;

  const write = (name: string, files: Record<string, string>) => {
    const dir = join(root, 'blueprints', name);
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  };
  const load = () => loadBlueprints(loadPresets(root), root);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-blueprints-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('loads a project blueprint beside the official ones, with the hash of what it read', () => {
    write('studio', { 'blueprint.yaml': STUDIO });

    const studio = load().blueprints.get('studio');

    expect(studio).toMatchObject({ name: 'studio', origin: 'project' });
    expect(studio?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a name that differs from its directory, a missing playbook and an official name', () => {
    write('other', { 'blueprint.yaml': STUDIO });
    write('studio', { 'blueprint.yaml': `${STUDIO}playbook: ./how.md\n` });
    write('product', { 'blueprint.yaml': STUDIO.replace('studio', 'product') });

    expect(load().problems.map(({ blueprint, message }) => [blueprint, message])).toEqual([
      ['other', 'blueprint: "studio" does not match its directory "other"'],
      ['product', '"product" is an official blueprint name; rename the project blueprint'],
      ['studio', 'playbook: ./how.md does not exist'],
    ]);
  });

  it('reports unknown presets and types against the project presets', () => {
    write('studio', { 'blueprint.yaml': STUDIO.replace('bugs.bug', 'bugs.story') });

    expect(load().problems.map(({ message }) => message)).toEqual([
      'connections[0]: board bugs (preset bug-triage) has no type "story" (types: bug)',
    ]);
  });
});

describe('blueprint warnings', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-blueprints-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const WAITS_FOR_NOTHING =
    'connections[0]: bugs.bug blocks work.task waits for nothing: no state of task (board work) requires blockers_closed, so no task waits for the bug that blocks it';

  it('reports a blocks link that waits for nothing, as a warning of the project blueprint', () => {
    const project = projectOf(root, memoryContext());
    mkdirSync(project.dataDir, { recursive: true });
    applyBlueprint(project, 'product', root);

    expect(blueprintFindings(project)).toEqual([
      { severity: 'warning', subject: 'project blueprint product', message: WAITS_FOR_NOTHING },
    ]);
    project.db.close();
  });

  it('lists the same warning beside each blueprint Studio offers', () => {
    const project = projectOf(root, memoryContext());

    const product = listStudioBlueprints(project).blueprints.find(({ name }) => name === 'product');

    expect(product?.warnings).toEqual([WAITS_FOR_NOTHING]);
    project.db.close();
  });
});

describe("copying a board's preset into the project", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-blueprints-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const built = () => {
    const project = projectOf(root, memoryContext());
    mkdirSync(project.dataDir, { recursive: true });
    applyBlueprint(project, 'product', root);
    createItem(project, {
      collection: 'work',
      title: 'Coyote time on moving platforms',
      fields: {},
      actor: { kind: 'human', name: 'human' },
      channel: 'ui',
    });
    return project;
  };

  it('copies the official preset at v1 and points the board at it, items and all', () => {
    const project = built();

    const copied = copyBoardPreset(project, 'work', 'game-tasks');

    expect(copied).toMatchObject({
      board: 'work',
      preset: { name: 'game-tasks', origin: 'project', editable: true, version: 1 },
    });
    expect(project.blueprint?.boards).toEqual([
      { name: 'work', preset: 'game-tasks' },
      { name: 'bugs', preset: 'bug-triage' },
    ]);
    expect(readFileSync(join(project.dataDir, 'blueprint.yaml'), 'utf8')).toContain(
      'preset: game-tasks',
    );
    expect(findCollection(project.db, 'work')).toMatchObject({
      preset: 'game-tasks',
      presetVersion: 1,
    });
    expect(selectItems(project.db, { collection: 'work' })).toEqual([
      expect.objectContaining({ title: 'Coyote time on moving platforms', presetVersion: 1 }),
    ]);
    project.db.close();
  });

  it('refuses a board the blueprint does not list, or a name already taken', () => {
    const project = built();

    expect(() => copyBoardPreset(project, 'art', 'game-tasks')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => copyBoardPreset(project, 'work', 'bug-triage')).toThrow(
      expect.objectContaining({ code: 'already_exists' }),
    );
    expect(project.blueprint?.boards[0]).toEqual({ name: 'work', preset: 'tasks' });
    project.db.close();
  });

  it('never points a board with items at a preset whose types or states differ', () => {
    const project = built();

    expect(() => pointBoardAt(project, 'work', 'bug-triage')).toThrow(
      expect.objectContaining({ code: 'in_use' }),
    );
    expect(findCollection(project.db, 'work')?.preset).toBe('tasks');
    project.db.close();
  });
});
