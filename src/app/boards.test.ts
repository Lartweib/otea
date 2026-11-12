import { describe, expect, it } from 'vitest';
import { stateOf } from '../core/board/engine.ts';
import { sequenceIds } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { creatures, step } from '../core/board/testing.ts';
import { parsePreset } from '../core/preset.ts';
import { findCollection } from '../store/queries.ts';
import {
  createBoard,
  discardDraft,
  getBoardRecord,
  listBoardSummaries,
  migrateCollections,
  publishBoard,
  publishPlan,
  restoreBoard,
  saveDraft,
  syncBoardPresets,
} from './boards.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function draftOf(ctx: Context, id: string): BoardDefinition {
  const draft = getBoardRecord(ctx, id).draft;
  if (!draft) throw new Error('no draft');
  return draft.definition;
}

// A published Criaturas board, as the fixture defines it.
function published(ctx: Context) {
  const record = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: creatures(), baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  return getBoardRecord(ctx, record.id);
}

describe('createBoard', () => {
  it('starts a blank board as a draft nobody sees yet', () => {
    const ctx = memoryContext();
    const record = createBoard(ctx, { name: 'Criaturas', item: 'Criatura', lang: 'es' }, now);
    expect(record.live).toBeNull();
    expect(record.draft?.definition.steps.map(({ name }) => name)).toEqual(['Hacerlo']);
    expect(listBoardSummaries(ctx)).toEqual([
      expect.objectContaining({
        id: record.id,
        name: 'Criaturas',
        item: 'Criatura',
        status: 'draft',
        liveVersion: null,
        open: 0,
      }),
    ]);
  });

  it('copies a template under any name, capitals, accents and spaces included', () => {
    const ctx = memoryContext();
    const record = createBoard(
      ctx,
      { name: 'Criaturas del pantano', template: 'assets', lang: 'es' },
      now,
    );
    expect(record.draft?.definition).toEqual(
      expect.objectContaining({
        name: 'Criaturas del pantano',
        item: 'Criatura',
        template: 'assets',
      }),
    );
  });

  it('refuses an empty name and a name another board has, in words', () => {
    const ctx = memoryContext();
    createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now);
    expect(() => createBoard(ctx, { name: '  ', lang: 'es' }, now)).toThrow(
      expect.objectContaining({ code: 'invalid_name' }),
    );
    expect(() => createBoard(ctx, { name: 'criaturas', lang: 'es' }, now)).toThrow(
      expect.objectContaining({ code: 'already_exists' }),
    );
    expect(() => createBoard(ctx, { name: 'X', template: 'nope', lang: 'es' }, now)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
});

describe('saveDraft', () => {
  it('writes the whole draft and answers with its problems', () => {
    const ctx = memoryContext();
    const { id } = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now);
    const result = saveDraft(
      ctx,
      id,
      { definition: { ...creatures(), steps: [] }, baseVersion: null },
      now,
    );
    expect(result.problems.map(({ code }) => code)).toEqual(['no_steps']);
    expect(draftOf(ctx, id).steps).toEqual([]);
  });

  it('refuses a malformed draft with where and why', () => {
    const ctx = memoryContext();
    const { id } = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now);
    expect(() =>
      saveDraft(ctx, id, { definition: { nope: true }, baseVersion: null }, now),
    ).toThrow(expect.objectContaining({ code: 'invalid_board' }));
  });

  it('refuses a draft based on a version that is no longer live', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    expect(() =>
      saveDraft(ctx, record.id, { definition: creatures(), baseVersion: 7 }, now),
    ).toThrow(expect.objectContaining({ code: 'board_conflict' }));
  });

  it('finds the name another board already has', () => {
    const ctx = memoryContext();
    createBoard(ctx, { name: 'Bugs', lang: 'es' }, now);
    const { id } = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now);
    const result = saveDraft(
      ctx,
      id,
      { definition: { ...creatures(), name: 'BUGS' }, baseVersion: null },
      now,
    );
    expect(
      result.problems.filter(({ level }) => level === 'error').map(({ code }) => code),
    ).toEqual(['board_name_taken']);
  });
});

describe('publishBoard', () => {
  it('puts a new board in motion: its collection, version 1 and items at the first step', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    expect(record.live?.version).toBe(1);
    expect(record.draft).toBeNull();
    expect(record.collection).toBe('Criaturas');
    expect(findCollection(ctx.db, 'Criaturas')).toEqual(
      expect.objectContaining({ preset: record.id, presetVersion: 1 }),
    );
    const item = createItem(ctx, {
      collection: 'Criaturas',
      title: 'Tortuga musgosa',
      fields: { fdesc: 'Una tortuga' },
      actor: you,
      channel: 'ui',
    });
    expect(item.state).toBe('sconcept');
    expect(listBoardSummaries(ctx)[0]).toEqual(
      expect.objectContaining({ status: 'live', open: 1 }),
    );
  });

  it('refuses a draft with errors and says which', () => {
    const ctx = memoryContext();
    const { id } = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now);
    saveDraft(ctx, id, { definition: { ...creatures(), steps: [] }, baseVersion: null }, now);
    expect(() => publishBoard(ctx, id, { moves: {}, by: you }, now)).toThrow(
      expect.objectContaining({ code: 'not_publishable' }),
    );
  });

  it('moves the items of a removed step where asked, and plans it first', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    const item = createItem(ctx, {
      collection: 'Criaturas',
      title: 'A',
      fields: { fdesc: 'x' },
      actor: you,
      channel: 'ui',
    });
    const draft = {
      ...creatures(),
      steps: creatures()
        .steps.filter(({ id }) => id !== 'sconcept')
        .map((s) => ({ ...s, back: 'same' })),
    };
    saveDraft(ctx, record.id, { definition: draft, baseVersion: 1 }, now);
    const plan = publishPlan(ctx, record.id);
    expect(plan).toEqual(
      expect.objectContaining({
        from: 1,
        to: 2,
        changes: [
          { kind: 'step_back', step: 'sanimate', name: 'Animar' },
          { kind: 'step_removed', step: 'sconcept', name: 'Concepto' },
        ],
        effects: expect.objectContaining({
          moves: [{ step: 'sconcept', name: 'Concepto', items: [item.id], suggested: 'sanimate' }],
        }),
      }),
    );
    const result = publishBoard(ctx, record.id, { moves: { sconcept: 'spolish' }, by: you }, now);
    expect(result.version).toBe(2);
    expect(result.moved).toEqual([{ id: item.id, from: 'sconcept', to: 'spolish' }]);
    const after = getItem(ctx, item.id);
    expect(after.state).toBe('spolish');
    expect(after.events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'transitioned',
        data: expect.objectContaining({ from: 'sconcept', to: 'spolish', board_version: 2 }),
      }),
    );
  });

  it('renames the collection when the board is renamed, keeping its items', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    const item = createItem(ctx, {
      collection: 'Criaturas',
      title: 'A',
      fields: { fdesc: 'x' },
      actor: you,
      channel: 'ui',
    });
    saveDraft(
      ctx,
      record.id,
      { definition: { ...creatures(), name: 'Bestias del pantano' }, baseVersion: 1 },
      now,
    );
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
    expect(getBoardRecord(ctx, record.id).collection).toBe('Bestias del pantano');
    expect(getItem(ctx, item.id).collection).toBe('Bestias del pantano');
  });
});

describe('publish moves', () => {
  it('lets go of the lease of an item a publish moves, and records it', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    const item = createItem(ctx, {
      collection: 'Criaturas',
      title: 'A',
      fields: { fdesc: 'x' },
      actor: you,
      channel: 'ui',
    });
    claimItem(ctx, { id: item.id, actor: kiln }, now);
    const draft = {
      ...creatures(),
      steps: creatures()
        .steps.filter(({ id }) => id !== 'sconcept')
        .map((s) => ({ ...s, back: 'same' })),
    };
    saveDraft(ctx, record.id, { definition: draft, baseVersion: 1 }, now);
    publishBoard(ctx, record.id, { moves: { sconcept: 'spolish' }, by: you }, now);
    expect(getItem(ctx, item.id).lease).toBeNull();
    expect(showItem(ctx, item.id, { actor: you, channel: 'ui' }).events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'released',
        data: expect.objectContaining({ holder: 'kiln', cause: 'publish' }),
      }),
    );
  });
});

describe('restoreBoard', () => {
  it('undoes a publish: the previous version is live again, the items go back, the changes return to the draft', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    const item = createItem(ctx, {
      collection: 'Criaturas',
      title: 'A',
      fields: { fdesc: 'x' },
      actor: you,
      channel: 'ui',
    });
    const draft = {
      ...creatures(),
      steps: creatures()
        .steps.filter(({ id }) => id !== 'sconcept')
        .map((s) => ({ ...s, back: 'same' })),
    };
    saveDraft(ctx, record.id, { definition: draft, baseVersion: 1 }, now);
    publishBoard(ctx, record.id, { moves: { sconcept: 'spolish' }, by: you }, now);
    const restored = restoreBoard(ctx, record.id, { version: 1, by: you }, now);
    expect(restored.live?.version).toBe(1);
    expect(restored.draft?.definition.steps.map(({ id }) => id)).toEqual(['sanimate', 'spolish']);
    expect(restored.draft?.baseVersion).toBe(1);
    expect(getItem(ctx, item.id).state).toBe('sconcept');
    expect(restored.versions.map(({ version }) => version)).toEqual([1, 2]);
  });

  it('refuses to restore while items stand in a step the restored version lacks, and says which', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    const item = createItem(ctx, {
      collection: 'Criaturas',
      title: 'A',
      fields: { fdesc: 'x' },
      actor: you,
      channel: 'ui',
    });
    const draft = creatures();
    draft.steps = [step('sfirst', 'Antes', { reviewer: 'none' }), ...draft.steps];
    saveDraft(ctx, record.id, { definition: draft, baseVersion: 1 }, now);
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
    ctx.db.prepare('UPDATE items SET state = ? WHERE id = ?').run('sfirst', item.id);

    expect(() => restoreBoard(ctx, record.id, { version: 1, by: you }, now)).toThrow(
      expect.objectContaining({
        code: 'not_undoable',
        message: `${item.id} stands in Antes, which version 1 does not have`,
      }),
    );
    expect(getBoardRecord(ctx, record.id).live?.version).toBe(2);
  });

  it('restores the old name only when no other board took it, in words', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    saveDraft(
      ctx,
      record.id,
      { definition: { ...creatures(), name: 'Bestias' }, baseVersion: 1 },
      now,
    );
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
    const other = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now);
    publishBoard(ctx, other.id, { moves: {}, by: you }, now);

    expect(() => restoreBoard(ctx, record.id, { version: 1, by: you }, now)).toThrow(
      expect.objectContaining({
        code: 'already_exists',
        message: 'Another board is called Criaturas now: rename it before you undo this',
      }),
    );
  });

  it('keeps a draft written since the publish instead of overwriting it', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    saveDraft(
      ctx,
      record.id,
      { definition: { ...creatures(), item: 'Bestia' }, baseVersion: 1 },
      now,
    );
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
    saveDraft(
      ctx,
      record.id,
      { definition: { ...creatures(), item: 'Monstruo' }, baseVersion: 2 },
      now,
    );
    const restored = restoreBoard(ctx, record.id, { version: 1, by: you }, now);
    expect(restored.draft?.definition.item).toBe('Monstruo');
    expect(restored.draft?.baseVersion).toBe(1);
  });

  it('undoes a first publish while nothing was created on it', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    const restored = restoreBoard(ctx, record.id, { version: null, by: you }, now);
    expect(restored.live).toBeNull();
    expect(restored.collection).toBeNull();
    expect(restored.draft?.definition.name).toBe('Criaturas');
    expect(findCollection(ctx.db, 'Criaturas')).toBeUndefined();
  });

  it('refuses to undo a first publish once items exist', () => {
    const ctx = memoryContext();
    const record = published(ctx);
    createItem(ctx, {
      collection: 'Criaturas',
      title: 'A',
      fields: { fdesc: 'x' },
      actor: you,
      channel: 'ui',
    });
    expect(() => restoreBoard(ctx, record.id, { version: null, by: you }, now)).toThrow(
      expect.objectContaining({ code: 'not_undoable' }),
    );
  });
});

describe('discardDraft', () => {
  it('drops a board never published, and only the draft of a live one', () => {
    const ctx = memoryContext();
    const fresh = createBoard(ctx, { name: 'Bugs', lang: 'es' }, now);
    expect(discardDraft(ctx, fresh.id)).toEqual({ deleted: true });
    expect(listBoardSummaries(ctx)).toEqual([]);
    const record = published(ctx);
    saveDraft(
      ctx,
      record.id,
      { definition: { ...creatures(), item: 'Bestia' }, baseVersion: 1 },
      now,
    );
    expect(listBoardSummaries(ctx)[0]?.status).toBe('changed');
    expect(discardDraft(ctx, record.id)).toEqual({ deleted: false });
    expect(getBoardRecord(ctx, record.id).draft).toBeNull();
  });
});

describe('syncBoardPresets', () => {
  it('compiles what another connection published', () => {
    const one = memoryContext();
    const record = published(one);
    expect(one.presets.presets.has(record.id)).toBe(true);
    const other: Context = { db: one.db, presets: memoryContext().presets };
    expect(other.presets.presets.has(record.id)).toBe(false);
    syncBoardPresets(other);
    expect(other.presets.presets.has(record.id)).toBe(true);
  });
});

describe('migrateCollections', () => {
  it('reads a collection on a preset as a published board, its items where they were', () => {
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Tareas', preset: 'tasks' });
    const todo = createItem(ctx, {
      collection: 'Tareas',
      title: 'A',
      fields: { description: 'x' },
      actor: you,
      channel: 'ui',
    });
    const review = createItem(ctx, {
      collection: 'Tareas',
      title: 'B',
      fields: { description: 'y' },
      actor: you,
      channel: 'ui',
    });
    moveItem(ctx, { id: review.id, to: 'in_progress', actor: kiln, channel: 'cli' });
    moveItem(ctx, { id: review.id, to: 'review', actor: kiln, channel: 'cli' });
    expect(migrateCollections(ctx, 'es', now)).toBe(1);
    const [board] = listBoardSummaries(ctx);
    expect(board).toEqual(
      expect.objectContaining({ name: 'Tareas', item: 'Tarea', status: 'live', liveVersion: 1 }),
    );
    expect(getItem(ctx, todo.id).state).toBe('todo');
    expect(getItem(ctx, review.id).state).toBe(stateOf({ step: 'todo', phase: 'review' }));
    expect(getItem(ctx, review.id).fields.description).toBe('y');
    expect(migrateCollections(ctx, 'es', now)).toBe(0);
  });

  it('gives enum values that are not ids an id, rewrites the items, and the project still opens', () => {
    const prio = parsePreset(`
preset: prio
preset_version: 1
fields:
  title: { module: text, required: create }
  prio: { module: enum, values: [P1, P2] }
workflow:
  initial: todo
  states:
    todo: { turn: agent }
    check: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: todo, to: check, by: agent }
    - { from: check, to: done, by: human }
`);
    const ctx = memoryContext(prio);
    addCollection(ctx, { name: 'Prio', preset: 'prio' });
    const item = createItem(ctx, {
      collection: 'Prio',
      title: 'A',
      fields: { prio: 'P2' },
      actor: you,
      channel: 'ui',
    });
    moveItem(ctx, { id: item.id, to: 'check', actor: kiln, channel: 'cli' });

    expect(migrateCollections(ctx, 'en', now)).toBe(1);
    expect(getItem(ctx, item.id).fields.prio).toBe('p2');
    expect(getItem(ctx, item.id).state).toBe('todo__review');
    expect(listBoardSummaries(ctx)[0]?.definition.parts.prio?.options[1]).toEqual({
      id: 'p2',
      name: 'P2',
    });
    expect(showItem(ctx, item.id, { actor: you, channel: 'ui' }).events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'transitioned',
        data: expect.objectContaining({ from: 'check', to: 'todo__review', reason: 'migrate' }),
      }),
    );
  });

  it('carries the preset playbook as the board text', () => {
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Tareas', preset: 'tasks' });
    migrateCollections(ctx, 'es', now, undefined, () => '# Playbook\n\nRead me.');
    expect(listBoardSummaries(ctx)[0]?.definition.about).toBe('# Playbook\n\nRead me.');
  });

  it('leaves a collection on its preset when its states wait for closed children', () => {
    const epic = parsePreset(`
preset: epic
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: building
  states:
    building: { turn: agent }
    review: { turn: human, requires: children_closed }
    done: { turn: none, closes: done }
  transitions:
    - { from: building, to: review, by: agent }
    - { from: review, to: done, by: human }
`);
    const ctx = memoryContext(epic);
    addCollection(ctx, { name: 'Epics', preset: 'epic' });

    expect(migrateCollections(ctx, 'es', now)).toBe(0);
  });

  it('leaves a collection whose preset has several item types on its preset', () => {
    const ctx = memoryContext();
    addCollection(ctx, { name: 'Cambios', preset: 'change' });

    expect(migrateCollections(ctx, 'es', now)).toBe(0);
    expect(listBoardSummaries(ctx)).toEqual([]);
    expect(findCollection(ctx.db, 'Cambios')?.preset).toBe('change');
  });
});
