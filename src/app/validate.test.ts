import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { memoryContext, REVIEWS } from './testing.ts';
import { validateProject } from './validate.ts';

const ana = { kind: 'human', name: 'ana' } as const;

describe('validateProject', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
    addCollection(ctx, { name: 'tasks' });
    createItem(ctx, { collection: 'tasks', title: 'A', fields: { description: 'D' }, actor: ana });
    createItem(ctx, { collection: 'tasks', title: 'B', actor: ana });
  });

  afterEach(() => ctx.db.close());

  it('reports nothing for a clean project', () => {
    expect(validateProject(ctx)).toEqual({ errors: 0, warnings: 0, findings: [] });
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
      message: 'written under preset reviews v1; the preset is now v3',
    });
    expect(report.errors).toBeGreaterThan(0);
    expect(report.warnings).toBeGreaterThan(0);
  });
});
