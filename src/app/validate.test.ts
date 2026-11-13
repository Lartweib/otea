import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cambios, tareasDeRepo } from '../core/board/testing.ts';
import { parsePreset } from '../core/preset.ts';
import { insertRelation } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { memoryContext, publishAs, REVIEWS } from './testing.ts';
import { validateProject } from './validate.ts';

const ana = { kind: 'human', name: 'ana' } as const;

// An epic waits for its children before it closes.
const EPICS = parsePreset(`
preset: epics
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states:
    open: { turn: agent }
    done: { turn: none, closes: done, requires: children_closed }
  transitions: [{ from: open, to: done, by: human }]
`);

describe('validateProject', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS, EPICS);
    addCollection(ctx, { name: 'tasks' });
    createItem(ctx, { collection: 'tasks', title: 'A', fields: { description: 'D' }, actor: ana });
    createItem(ctx, { collection: 'tasks', title: 'B', actor: ana });
  });

  afterEach(() => ctx.db.close());

  it('reports nothing for a clean project', () => {
    expect(validateProject(ctx)).toEqual({ errors: 0, warnings: 0, findings: [] });
  });

  it("reports a project preset's warnings, but neither its info notes nor an official preset's notes", () => {
    const note = (origin: 'official' | 'project', level: 'warning' | 'info', message: string) => ({
      preset: origin === 'project' ? 'reviews' : 'tasks',
      origin,
      path: 'preset.yaml',
      code: 'field_unplaced' as const,
      level,
      at: { section: 'fields' as const, field: 'x' },
      message,
    });
    ctx.presets = {
      ...ctx.presets,
      warnings: [
        note('project', 'warning', 'fields.x: placed in no layout slot'),
        note('project', 'info', 'types.a.fields.x: only a has it'),
        note('official', 'warning', 'workflow.states.review: turn human'),
      ],
    };

    expect(validateProject(ctx)).toEqual({
      errors: 0,
      warnings: 1,
      findings: [
        {
          severity: 'warning',
          subject: 'preset reviews',
          message: 'fields.x: placed in no layout slot',
        },
      ],
    });
  });

  it('reports preset problems as errors', () => {
    const problem = {
      preset: 'notes',
      origin: 'project',
      path: '/p',
      message: 'missing preset.yaml',
    };
    ctx.presets = { ...ctx.presets, problems: [problem] } as Context['presets'];

    expect(validateProject(ctx).findings).toEqual([
      { severity: 'error', subject: 'preset notes', message: 'missing preset.yaml' },
    ]);
  });

  it('reports a collection whose preset is missing and skips its items', () => {
    ctx.db.exec("UPDATE collections SET preset = 'gone'");

    expect(validateProject(ctx)).toMatchObject({
      errors: 1,
      findings: [
        { severity: 'error', subject: 'collection tasks', message: 'Preset "gone" not found' },
      ],
    });
  });

  it('checks every item against its collection preset', () => {
    ctx.db.exec("UPDATE items SET state = 'archived' WHERE id = 'TASKS-1'");
    // reviews declares no types: its items are of the implicit type.
    ctx.db.exec("UPDATE items SET type = 'item'");
    ctx.db.exec("UPDATE collections SET preset = 'reviews', preset_version = 3");

    const report = validateProject(ctx);

    expect(report.findings).toContainEqual({
      severity: 'error',
      subject: 'TASKS-1',
      message: 'unknown state "archived" in preset reviews',
    });
    expect(report.findings).toContainEqual({
      severity: 'warning',
      subject: 'TASKS-2',
      message: 'written under preset reviews v2; the preset is now v3',
    });
    expect(report.errors).toBeGreaterThan(0);
    expect(report.warnings).toBeGreaterThan(0);
  });

  describe('a parent in another collection, stored before the rule', () => {
    const storeParent = (from: string, to: string) =>
      insertRelation(ctx.db, {
        kind: 'parent',
        from,
        to,
        createdAt: 't0',
        actor: ana,
        channel: 'cli',
      });

    beforeEach(() => {
      addCollection(ctx, { name: 'epics', preset: 'epics' });
      addCollection(ctx, { name: 'notes', preset: 'reviews' });
      createItem(ctx, { collection: 'epics', title: 'Wolf', actor: ana });
      createItem(ctx, { collection: 'notes', title: 'Lore', actor: ana });
    });

    it('warns and suggests blocks when the parent waits for its children', () => {
      storeParent('TASKS-1', 'EPICS-1');

      expect(validateProject(ctx)).toEqual({
        errors: 0,
        warnings: 1,
        findings: [
          {
            severity: 'warning',
            subject: 'TASKS-1',
            message:
              'parent EPICS-1 is in another collection (epics); merge tasks and epics into one preset as types, or convert the link to blocks, since EPICS-1 waits for its children: otea unlink TASKS-1 parent EPICS-1, otea link TASKS-1 blocks EPICS-1, and write requires: blockers_closed where its preset requires children_closed',
          },
        ],
      });
    });

    it('suggests implements when the parent does not wait for its children', () => {
      storeParent('EPICS-1', 'NOTES-1');

      expect(validateProject(ctx).findings).toEqual([
        {
          severity: 'warning',
          subject: 'EPICS-1',
          message:
            'parent NOTES-1 is in another collection (notes); merge epics and notes into one preset as types, or convert the link to implements: otea unlink EPICS-1 parent NOTES-1, otea link EPICS-1 implements NOTES-1',
        },
      ]);
    });

    it('says nothing of a parent in the same collection', () => {
      storeParent('TASKS-2', 'TASKS-1');

      expect(validateProject(ctx).findings).toEqual([]);
    });
  });

  it('says nothing of a part on the board its parent’s board divides into', () => {
    const boards = memoryContext();
    publishAs(boards, tareasDeRepo(), 'brt');
    publishAs(boards, cambios(), 'bcam');
    const change = createItem(boards, {
      collection: 'Cambios',
      title: 'Nube',
      fields: { fwhat: 'x' },
      actor: ana,
    });
    createItem(boards, {
      collection: 'Tareas de repo',
      title: 'API',
      fields: { frepo: 'api', fbranch: 'feat/a' },
      parent: change.id,
      actor: ana,
    });

    expect(validateProject(boards).findings).toEqual([]);
    boards.db.close();
  });
});
