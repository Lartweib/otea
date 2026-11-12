import { describe, expect, it } from 'vitest';
import { cambios, errores, tareasDeRepo } from '../core/board/testing.ts';
import { updateItemState } from '../store/queries.ts';
import { listBoardSummaries, publishBoard, publishPlan, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem, getItem, showItem } from './items.ts';
import { itemNextText, itemOnBoard } from './next.ts';
import { linkItems } from './relations.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function changes(ctx: Context) {
  publishAs(ctx, tareasDeRepo(), 'brt', now);
  publishAs(ctx, cambios(), 'bcam', now);
  const change = createItem(
    ctx,
    { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'Todo' }, actor: you, channel: 'ui' },
    now,
  );
  const part = (title: string, branch: string) =>
    createItem(
      ctx,
      {
        collection: 'Tareas de repo',
        title,
        fields: { frepo: 'api', fbranch: branch },
        parent: change.id,
        actor: you,
        channel: 'ui',
      },
      now,
    );
  return { change, parts: [part('API', 'feat/a'), part('Web', 'feat/b'), part('CLI', 'feat/c')] };
}

describe('the facts an item on a board carries', () => {
  it('reads its parts with the board and step names, open or closed', () => {
    const ctx = memoryContext();
    const { change, parts } = changes(ctx);
    const [a, b, c] = parts.map(({ id }) => id) as [string, string, string];
    updateItemState(ctx.db, b, 'simpl', now());
    updateItemState(ctx.db, c, 'done', now());

    const on = itemOnBoard(ctx, getItem(ctx, change.id), cambios());

    expect(on.facts.parts).toEqual([
      { id: a, board: 'Tareas de repo', step: 'Propuesta', closed: false },
      { id: b, board: 'Tareas de repo', step: 'Implementar', closed: false },
      { id: c, board: 'Tareas de repo', closed: true },
    ]);
    expect(on.facts.blockers).toEqual([]);
  });

  it('reads what blocks it, on any board', () => {
    const ctx = memoryContext();
    const { change } = changes(ctx);
    publishAs(ctx, errores(), 'berr', now);
    const bug = createItem(
      ctx,
      { collection: 'Errores', title: 'Faro', fields: {}, actor: you, channel: 'ui' },
      now,
    );
    linkItems(
      ctx,
      { kind: 'blocks', id: bug.id, other: change.id, actor: you, channel: 'ui' },
      now,
    );

    const on = itemOnBoard(ctx, getItem(ctx, change.id), cambios());

    expect(on.facts.blockers).toEqual([
      { id: bug.id, board: 'Errores', step: 'Completar', closed: false },
    ]);
  });

  it('gives next the parts and the board they are on', () => {
    const ctx = memoryContext();
    const { change } = changes(ctx);
    updateItemState(ctx.db, change.id, 'sexec', now());

    const text = itemNextText(ctx, getItem(ctx, change.id)) ?? '';

    expect(text).toContain('Parts\n  Tareas de repo: 0 of 3 finished');
    expect(text).toContain(
      `Add one: otea create --collection "Tareas de repo" --parent ${change.id}`,
    );
    expect(text).toContain('✗ Tareas de repo finished: required (3 of 3 open:');
  });

  it('shows the board block of an item: parts, blockers, blocking, notes, gates and branch', () => {
    const ctx = memoryContext();
    const { change, parts } = changes(ctx);
    const [a] = parts;
    if (!a) throw new Error('no part');
    updateItemState(ctx.db, a.id, 'simpl', now());

    const parent = showItem(ctx, change.id, { actor: you, channel: 'ui' }, now);
    const part = showItem(ctx, a.id, { actor: you, channel: 'ui' }, now);

    expect(parent.board).toMatchObject({
      partsBoard: 'Tareas de repo',
      blockers: [],
      blocking: [],
      notes: [],
      gates: null,
      branch: null,
    });
    expect(parent.board?.parts).toHaveLength(3);
    expect(part.board).toMatchObject({
      parts: [],
      partsBoard: null,
      gates: { push: { allowed: true, why: 'doing' }, merge: { allowed: false, why: 'not_done' } },
      branch: { value: 'feat/a', repo: 'api' },
    });
  });
});

describe('the publish plan of a board whose items have parts', () => {
  it('counts the open parts of each item, for the step that starts waiting for them', () => {
    const ctx = memoryContext();
    const { change } = changes(ctx);
    updateItemState(ctx.db, change.id, 'sexec', now());
    const board = listBoardSummaries(ctx).find(({ name }) => name === 'Cambios');
    if (!board) throw new Error('no board');
    const live = cambios();
    live.steps = live.steps.map((step) => ({ ...step, waits: [] }));
    saveDraft(ctx, board.id, { definition: live, baseVersion: 1 }, now);
    publishBoard(ctx, board.id, { moves: {}, by: you }, now);
    saveDraft(ctx, board.id, { definition: cambios(), baseVersion: 2 }, now);

    expect(publishPlan(ctx, board.id).effects.waiting).toEqual([
      { step: 'sexec', name: 'Ejecutar', wait: 'parts', items: [change.id] },
    ]);
  });
});
