import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem } from './items.ts';
import { memoryContext, REVIEWS } from './testing.ts';
import { UNDO_WINDOW_MS, undoMove } from './undo.ts';

const you: Actor = { kind: 'human', name: 'human' };
const bot: Actor = { kind: 'agent', name: 'claude' };

const at = (s: number) => () => new Date(Date.UTC(2026, 10, 11, 12, 0, s)).toISOString();

describe('undoMove', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext(REVIEWS);
    addCollection(ctx, { name: 'tasks' });
    createItem(ctx, {
      collection: 'tasks',
      title: 'Ship',
      fields: { description: 'Now' },
      actor: bot,
    });
    moveItem(ctx, { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' });
    moveItem(ctx, { id: 'TASKS-1', to: 'review', actor: bot, channel: 'cli' }, at(0));
  });

  afterEach(() => ctx.db.close());

  it('takes back your approval even where the workflow has no move back', () => {
    moveItem(ctx, { id: 'TASKS-1', to: 'done', actor: you, channel: 'ui' }, at(1));
    const item = undoMove(ctx, { id: 'TASKS-1', from: 'review', actor: you, channel: 'ui' }, at(3));
    expect(item.state).toBe('review');
    expect(item.turn).toBe('human');
    const events = getItem(ctx, 'TASKS-1').events.filter((e) => e.type === 'transitioned');
    const approved = events.at(-2);
    expect(events.at(-1)?.data).toMatchObject({ from: 'done', to: 'review', undoes: approved?.id });
  });

  it('takes back a send-back with its notes', () => {
    moveItem(
      ctx,
      { id: 'TASKS-1', to: 'todo', actor: you, channel: 'ui', reason: 'Not yet' },
      at(1),
    );
    const item = undoMove(ctx, { id: 'TASKS-1', from: 'review', actor: you, channel: 'ui' }, at(2));
    expect(item.state).toBe('review');
  });

  it('refuses once the toast is long gone', () => {
    moveItem(ctx, { id: 'TASKS-1', to: 'done', actor: you, channel: 'ui' }, at(1));
    const late = () => new Date(Date.parse(at(1)()) + UNDO_WINDOW_MS + 1000).toISOString();
    expect(() =>
      undoMove(ctx, { id: 'TASKS-1', from: 'review', actor: you, channel: 'ui' }, late),
    ).toThrow(expect.objectContaining({ code: 'not_undoable' }));
  });

  it("refuses an agent's move, and a move that is not the last", () => {
    expect(() =>
      undoMove(ctx, { id: 'TASKS-1', from: 'in_progress', actor: you, channel: 'ui' }, at(2)),
    ).toThrow(expect.objectContaining({ code: 'not_undoable' }));
    moveItem(ctx, { id: 'TASKS-1', to: 'done', actor: you, channel: 'ui' }, at(1));
    expect(() =>
      undoMove(ctx, { id: 'TASKS-1', from: 'in_progress', actor: you, channel: 'ui' }, at(2)),
    ).toThrow(expect.objectContaining({ code: 'not_undoable' }));
  });

  it('undoes only once', () => {
    moveItem(ctx, { id: 'TASKS-1', to: 'done', actor: you, channel: 'ui' }, at(1));
    undoMove(ctx, { id: 'TASKS-1', from: 'review', actor: you, channel: 'ui' }, at(2));
    expect(() =>
      undoMove(ctx, { id: 'TASKS-1', from: 'done', actor: you, channel: 'ui' }, at(3)),
    ).toThrow(expect.objectContaining({ code: 'not_undoable' }));
  });
});
