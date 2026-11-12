import { describe, expect, it } from 'vitest';
import { cambios, tareasDeRepo } from '../core/board/testing.ts';
import { updateItemState } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import { checkGate } from './gates.ts';
import { createItem, updateItem } from './items.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function repoTask() {
  const ctx = memoryContext();
  publishAs(ctx, tareasDeRepo(), 'brt', now);
  publishAs(ctx, cambios(), 'bcam', now);
  const parent = createItem(
    ctx,
    { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
    now,
  );
  const task = createItem(
    ctx,
    {
      collection: 'Tareas de repo',
      title: 'API',
      fields: { frepo: 'api', fbranch: 'feat/x' },
      parent: parent.id,
      actor: you,
    },
    now,
  );
  return { ctx, id: task.id };
}

describe('gates on a board', () => {
  it('matches the protected branch and its repo by their hidden ids, and answers in words', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'simpl', now());

    const push = checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' });
    expect(push).toMatchObject({ allowed: true, items: [{ id, allowed: true }] });
    expect(push.items[0]?.text).toBe(`push allowed: ${id} is being done in Implementar.`);
    expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'web' }).items).toEqual([]);
    expect(checkGate(ctx, 'push', { branch: 'feat/y' }).items).toEqual([]);
  });

  it('refuses a push while the step is reviewed, and a merge until Done', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'simpl__review', now());

    const push = checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' });
    expect(push.allowed).toBe(false);
    expect(push.items[0]?.text).toBe(
      `push refused: ${id} waits for the person to review Implementar; its branch can be pushed only while Implementar is being done.`,
    );
    const merge = checkGate(ctx, 'merge', { branch: 'feat/x', repo: 'api' });
    expect(merge.items[0]?.text).toBe(
      `merge refused: ${id} is in Implementar, round 1; its branch can be merged only once ${id} is Done.`,
    );
    updateItemState(ctx.db, id, 'done', now());
    expect(checkGate(ctx, 'merge', { branch: 'feat/x', repo: 'api' })).toMatchObject({
      allowed: true,
    });
  });

  it('reads --field by the part’s name', () => {
    const { ctx, id } = repoTask();
    expect(checkGate(ctx, 'push', { Rama: 'feat/x' }).items.map((item) => item.id)).toEqual([id]);
  });
  it('refuses an unknown --field name instead of matching nothing', () => {
    const { ctx } = repoTask();
    expect(() => checkGate(ctx, 'push', { branch: 'feat/x', Rpo: 'api' })).toThrow(
      expect.objectContaining({ code: 'invalid_fields' }),
    );
  });

  it('fails closed when a collection still on a preset cannot be read', () => {
    const { ctx } = repoTask();
    addCollection(ctx, { name: 'Lost', preset: 'tasks' });
    createItem(ctx, { collection: 'Lost', title: 'x', actor: you });
    ctx.db.prepare("UPDATE collections SET preset = 'gone' WHERE name = 'Lost'").run();
    expect(() => checkGate(ctx, 'push', { branch: 'feat/x' })).toThrow();
  });

  it('keeps the protected branch frozen for an agent outside the steps that push it', () => {
    const { ctx, id } = repoTask();
    const claude = { kind: 'agent' as const, name: 'claude' };
    updateItemState(ctx.db, id, 'simpl__review', now());
    expect(() =>
      updateItem(ctx, { id, fields: { Rama: 'feat/other' }, actor: claude }, now),
    ).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(() => updateItem(ctx, { id, fields: { Repo: 'web' }, actor: claude }, now)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' }).allowed).toBe(false);
    updateItemState(ctx.db, id, 'simpl', now());
    expect(
      updateItem(ctx, { id, fields: { Rama: 'feat/y' }, actor: claude }, now).fields,
    ).toMatchObject({
      fbranch: 'feat/y',
    });
  });
});
