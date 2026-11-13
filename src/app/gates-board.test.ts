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

function repoTask(base?: string) {
  const ctx = memoryContext();
  const def = tareasDeRepo();
  const guard = def.parts.fbranch?.guard;
  if (guard && base !== undefined) guard.base = base;
  publishAs(ctx, def, 'brt', now);
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
      `merge refused: ${id} is in the review of Implementar, round 1; its branch can be merged only once ${id} is Done.`,
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

  describe('with the base branch protected', () => {
    it('leaves the base alone when the board does not protect it', () => {
      const { ctx } = repoTask();
      expect(checkGate(ctx, 'push', { branch: 'main', repo: 'api' })).toMatchObject({
        allowed: true,
        items: [],
      });
    });

    it('refuses a push to the base that brings in no item’s branch', () => {
      const { ctx } = repoTask('main');
      const check = checkGate(ctx, 'push', { branch: 'main', repo: 'api' }, () => ['scratch']);
      expect(check).toMatchObject({ allowed: false, items: [] });
      expect(check.refusal).toBe(
        'push refused: main is the base branch Tareas de repo protects; it takes only the branch of a Tarea de repo that is Done, and this push brings in none.',
      );
      expect(checkGate(ctx, 'push', { branch: 'main', repo: 'api' }).allowed).toBe(false);
    });

    it('refuses a push to the base that brings in an item in review, and allows it once Done', () => {
      const { ctx, id } = repoTask('main');
      updateItemState(ctx.db, id, 'simpl__review', now());
      const brings = () => ['feat/x'];

      const check = checkGate(ctx, 'push', { branch: 'main', repo: 'api' }, brings);
      expect(check).toMatchObject({ allowed: false, items: [{ id, allowed: false }] });
      expect(check.items[0]?.text).toBe(
        `push refused: ${id} is in Implementar, round 1; main takes its branch only once ${id} is Done.`,
      );
      expect(checkGate(ctx, 'push', { branch: 'main', repo: 'web' }, brings).allowed).toBe(false);
      updateItemState(ctx.db, id, 'done', now());
      const done = checkGate(ctx, 'push', { branch: 'main', repo: 'api' }, brings);
      expect(done).toMatchObject({ allowed: true, items: [{ id, allowed: true }] });
      expect(done.items[0]?.text).toBe(`push allowed: ${id} is Done; main takes its branch.`);
    });

    it('checks a merge into the base like a push to it', () => {
      const { ctx, id } = repoTask('main');
      const merge = checkGate(ctx, 'merge', { branch: 'main', repo: 'api' }, () => ['feat/x']);
      expect(merge.items[0]?.text).toBe(
        `merge refused: ${id} is in Propuesta, round 1; main takes its branch only once ${id} is Done.`,
      );
      expect(checkGate(ctx, 'merge', { branch: 'main' }, () => ['feat/z']).refusal).toBe(
        'merge refused: main is the base branch Tareas de repo protects; it takes only the branch of a Tarea de repo that is Done, and this merge brings in none.',
      );
    });

    it('still gates the item’s own branch as before', () => {
      const { ctx, id } = repoTask('main');
      updateItemState(ctx.db, id, 'simpl', now());
      expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' })).toMatchObject({
        allowed: true,
        items: [{ id }],
      });
    });
  });
});
