import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SUCCESS } from '../core/brief.ts';
import type { Actor } from '../core/item.ts';
import { briefFor } from './brief.ts';
import { addCollection } from './collections.ts';
import { createItem, moveItem } from './items.ts';
import type { Project } from './project.ts';
import { linkItems } from './relations.ts';
import { memoryContext, projectOf } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const at = () => '2026-11-03T14:12:30.000Z';

describe('briefFor', () => {
  let project: Project;

  const task = (title: string) =>
    createItem(
      project,
      { collection: 'tasks', title, fields: { description: `Why ${title}` }, actor: ana },
      at,
    );
  const link = (id: string, other: string) =>
    linkItems(project, { id, kind: 'blocks', other, actor: ana, channel: 'cli' }, at);

  beforeEach(() => {
    project = projectOf('/memory', memoryContext());
    addCollection(project, { name: 'tasks' });
    for (const title of ['One', 'Two', 'Three', 'Four']) task(title);
  });

  afterEach(() => project.db.close());

  it('orders the chosen items by their blocks and names the open blockers left out', () => {
    link('TASKS-3', 'TASKS-1');
    link('TASKS-4', 'TASKS-2');

    const { order, markdown, success } = briefFor(
      project,
      { ids: ['TASKS-1', 'TASKS-2', 'TASKS-3'] },
      at,
    );

    expect(order.map(({ id, after, missing }) => [id, after, missing])).toEqual([
      ['TASKS-3', [], []],
      ['TASKS-1', ['TASKS-3'], []],
      ['TASKS-2', [], ['TASKS-4']],
    ]);
    expect(markdown).toContain('2026-11-03 14:12 UTC');
    expect(markdown).toContain('Why One');
    expect(markdown).toContain(`- ${DEFAULT_SUCCESS[0]}`);
    expect(success).toEqual(DEFAULT_SUCCESS);
  });

  it('drops a closed blocker left out of the brief', () => {
    link('TASKS-4', 'TASKS-2');
    moveItem(
      project,
      { id: 'TASKS-4', to: 'discarded', reason: 'not needed', actor: ana, channel: 'ui' },
      at,
    );

    expect(briefFor(project, { ids: ['TASKS-2'], limits: [], success: [] }, at).order).toEqual([
      { id: 'TASKS-2', title: 'Two', after: [], missing: [] },
    ]);
  });

  it('fails on an unknown item and on an empty choice', () => {
    expect(() => briefFor(project, { ids: ['TASKS-9'] }, at)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => briefFor(project, { ids: [] }, at)).toThrow(
      expect.objectContaining({ code: 'invalid_id' }),
    );
  });
});
