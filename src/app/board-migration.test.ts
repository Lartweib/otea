import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import { parsePreset } from '../core/preset.ts';
import { selectEvents } from '../store/queries.ts';
import { migrateBoards, migrateProjectBoards } from './board-migration.ts';
import { getBoardRecord, listBoardSummaries } from './boards.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { checkGate } from './gates.ts';
import { createItem, getItem, moveItem } from './items.ts';
import { loadPresets } from './presets.ts';
import { addRelation } from './relations.ts';
import { catalogWith, memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function item(ctx: Context, collection: string, title: string, more = {}) {
  return createItem(ctx, {
    collection,
    title,
    fields: { description: 'x' },
    actor: you,
    channel: 'ui',
    ...more,
  });
}

const boardOf = (ctx: Context, name: string) => {
  const summary = listBoardSummaries(ctx).find((board) => board.name === name);
  if (!summary) throw new Error(`no board ${name}`);
  return getBoardRecord(ctx, summary.id);
};

describe('migrateBoards', () => {
  it('reads bug-triage as Errores, Falta información as Completar with the question as its note', () => {
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Errores', preset: 'bug-triage' });
    const asked = item(ctx, 'Errores', 'El faro', {
      fields: {
        description: 'no se enciende',
        steps: 'abrir',
        expected: 'luz',
        actual: 'nada',
        severity: 'high',
      },
    });
    moveItem(ctx, {
      id: asked.id,
      to: 'needs_info',
      actor: you,
      channel: 'ui',
      reason: '¿Qué versión?',
    });
    const dup = item(ctx, 'Errores', 'Otra vez el faro');
    moveItem(ctx, { id: dup.id, to: 'duplicate', actor: you, channel: 'ui', reason: 'ya está' });
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(1);
    const live = boardOf(ctx, 'Errores').live?.definition;
    expect(live?.steps.map(({ name }) => name)).toEqual(['Completar', 'Triar', 'Arreglar']);
    expect(getItem(ctx, asked.id).state).toBe('incomplete');
    const migrate = selectEvents(ctx.db, asked.id).at(-1);
    expect(migrate?.data).toMatchObject({ reason: 'migrate', note: '¿Qué versión?' });
    expect(getItem(ctx, dup.id).state).toBe('dropped__duplicate');
    expect(getItem(ctx, asked.id).fields.severity).toBe('high');
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(0);
  });

  it('splits change into Cambios and Tareas de repo, moving the repo tasks with their links', () => {
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Cambios', preset: 'change' });
    const change = item(ctx, 'Cambios', 'Guardar en la nube', { type: 'change' });
    const task = createItem(ctx, {
      collection: 'Cambios',
      type: 'repo_task',
      parent: change.id,
      title: 'API',
      fields: { repo: 'api', branch: 'feat/nube' },
      actor: you,
      channel: 'ui',
    });
    moveItem(ctx, { id: task.id, to: 'ready', actor: you, channel: 'ui' });
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(1);
    const changes = boardOf(ctx, 'Cambios');
    const tasks = boardOf(ctx, 'Tareas de repo');
    expect(changes.live?.definition.split).toEqual({ board: tasks.id, always: true });
    expect(tasks.collection).toBe('Tareas de repo');
    const moved = getItem(ctx, task.id);
    expect(moved.collection).toBe('Tareas de repo');
    expect(moved.state).toBe('implementing');
    expect(moved.fields.branch).toBe('feat/nube');
    expect(getItem(ctx, change.id).state).toBe('analysing');
    expect(tasks.live?.definition.parts.branch?.guard).toEqual({
      push: ['implementing'],
      repo: 'repo',
    });
    // The moved tasks keep their numbers; new ones are numbered after them.
    const next = () =>
      createItem(ctx, {
        collection: 'Tareas de repo',
        parent: change.id,
        title: 'Web',
        fields: { repo: 'web', branch: 'feat/web' },
        actor: you,
        channel: 'ui',
      }).id;
    expect([next(), next(), next()]).toHaveLength(3);
  });

  it('reads a collection on a preset Otea never shipped as one step that keeps its fields', () => {
    const recipes = parsePreset(`
preset: recipes
preset_version: 1
fields:
  title: { module: text, required: create }
  ingredients: { module: markdown }
workflow:
  initial: cooking
  states:
    cooking: { turn: agent }
    served: { turn: none, closes: done }
  transitions: [{ from: cooking, to: served, by: human }]
`);
    const ctx = memoryContext(recipes);
    addCollection(ctx, { name: 'Recetas', preset: 'recipes' });
    const open = item(ctx, 'Recetas', 'Sopa', { fields: { ingredients: 'agua' } });
    const done = item(ctx, 'Recetas', 'Pan', { fields: {} });
    moveItem(ctx, { id: done.id, to: 'served', actor: you, channel: 'ui' });
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(1);
    const board = boardOf(ctx, 'Recetas').live?.definition;
    expect(board?.steps.map(({ name }) => name)).toEqual(['Hacerlo']);
    expect(getItem(ctx, open.id).state).toBe(board?.steps[0]?.id);
    expect(getItem(ctx, open.id).fields.ingredients).toBe('agua');
    expect(getItem(ctx, done.id).state).toBe('done');
  });

  it("carries a project preset's playbooks into the board's words for agents", () => {
    const dir = mkdtempSync(join(tmpdir(), 'otea-pb-'));
    const preset = join(dir, 'presets', 'recipes');
    mkdirSync(preset, { recursive: true });
    writeFileSync(
      join(preset, 'preset.yaml'),
      `preset: recipes
preset_version: 1
playbook: ./playbook.md
types:
  dish: { label: Dish, playbook: ./dish.md }
fields:
  title: { module: text, required: create }
workflow:
  initial: cooking
  states:
    cooking: { turn: agent }
    served: { turn: none, closes: done }
  transitions: [{ from: cooking, to: served, by: human }]
`,
    );
    writeFileSync(join(preset, 'playbook.md'), '# Recipes\n\nTaste before you serve.\n');
    writeFileSync(join(preset, 'dish.md'), 'Plate it warm.\n');
    const ctx = { ...memoryContext(), presets: loadPresets(dir) };
    addCollection(ctx, { name: 'Recetas', preset: 'recipes' });
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(1);
    expect(boardOf(ctx, 'Recetas').live?.definition.about).toBe(
      '# Recipes\n\nTaste before you serve.\n\nPlate it warm.',
    );
  });

  it('keeps a blocks link between two migrated boards as a plain link', () => {
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Tareas', preset: 'tasks' });
    addCollection(ctx, { name: 'Errores', preset: 'bug-triage' });
    const task = item(ctx, 'Tareas', 'Cerrar el mapa');
    const bug = item(ctx, 'Errores', 'El faro');
    addRelation(
      ctx,
      { from: bug.id, kind: 'blocks', to: task.id },
      { actor: you, channel: 'ui' },
      now(),
    );
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(2);
    expect(getItem(ctx, task.id).collection).toBe('Tareas');
  });
  it('keeps the git gates of a preset Otea never shipped as a guard on its branch', () => {
    const ships = parsePreset(`
preset: ships
preset_version: 1
fields:
  title: { module: text, required: create }
  branch: { module: text }
  repo: { module: text }
workflow:
  initial: building
  states:
    building: { turn: agent }
    checking: { turn: human }
    shipped: { turn: none, closes: done }
  transitions: [{ from: building, to: checking, by: agent }, { from: checking, to: shipped, by: human }]
  gates:
    push: [building]
    merge: [shipped]
`);
    const ctx = memoryContext(ships);
    addCollection(ctx, { name: 'Barcos', preset: 'ships' });
    const open = item(ctx, 'Barcos', 'Casco', { fields: { branch: 'feat/x', repo: 'api' } });
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(1);
    const merge = checkGate(ctx, 'merge', { branch: 'feat/x' });
    expect(merge.items.map(({ id }) => id)).toEqual([open.id]);
    expect(merge.allowed).toBe(false);
    expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' }).allowed).toBe(true);
  });

  it('leaves a collection whose preset did not load on it, closed items closed', () => {
    const recipes = parsePreset(`
preset: recipes
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: cooking
  states:
    cooking: { turn: agent }
    served: { turn: none, closes: done }
  transitions: [{ from: cooking, to: served, by: human }]
`);
    const loaded = memoryContext(recipes);
    addCollection(loaded, { name: 'Recetas', preset: 'recipes' });
    const done = item(loaded, 'Recetas', 'Pan', { fields: {} });
    moveItem(loaded, { id: done.id, to: 'served', actor: you, channel: 'ui' });
    const ctx = { ...loaded, presets: catalogWith() };
    expect(migrateBoards(ctx, 'es', now, sequenceIds())).toBe(0);
    expect(loaded.db.prepare('SELECT state FROM items WHERE id = ?').get(done.id)).toEqual({
      state: 'served',
    });
  });

  it('keeps the blueprint while a collection it names is still unread', () => {
    const dir = mkdtempSync(join(tmpdir(), 'otea-bp-'));
    const path = join(dir, 'blueprint.yaml');
    writeFileSync(path, 'connections:\n  - "Errores.bug blocks Recetas.item"\n');
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Recetas', preset: 'tasks' });
    // A preset that is gone keeps its collection unread.
    ctx.db.prepare("UPDATE collections SET preset = 'gone' WHERE name = 'Recetas'").run();
    migrateProjectBoards({ ...ctx, dataDir: dir }, 'es');
    expect(existsSync(path)).toBe(true);
  });

  it('keeps a blueprint it cannot read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'otea-bp-'));
    const path = join(dir, 'blueprint.yaml');
    writeFileSync(path, 'connections: [unclosed\n');
    migrateProjectBoards({ ...memoryContext(), dataDir: dir }, 'es');
    expect(existsSync(path)).toBe(true);
  });
});
