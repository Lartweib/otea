import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import { OteaError } from '../core/errors.ts';
import { findCollection } from '../store/queries.ts';
import {
  createBoard,
  createBoardSet,
  discardDraft,
  getBoardRecord,
  publishBoard,
  restoreBoard,
} from './boards.ts';
import type { Context } from './context.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 17, 9, 0, tick++)).toISOString();

// Ideas → Tareas: Ideas plans its tasks on Implementación, a board the set made with it that no
// split joins. Publishing one without the other leaves Planificar with nowhere to create tasks.
function ideasSet(ctx: Context) {
  const [ideas, tasks] = createBoardSet(
    ctx,
    { set: 'ideas', lang: 'es', boards: [] },
    now,
    sequenceIds(),
  );
  if (!ideas || !tasks) throw new Error('no set');
  return { ideas: ideas.id, tasks: tasks.id };
}

describe('publishBoard alongside the boards its set made with it', () => {
  it('publishes Ideas and Implementación together, in one go', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    const result = publishBoard(ctx, ideas, { moves: {}, by: you, alongside: [tasks] }, now);
    expect(result.version).toBe(1);
    expect(result.alongside?.map(({ record }) => record.id)).toEqual([tasks]);
    expect(getBoardRecord(ctx, ideas).live?.version).toBe(1);
    expect(getBoardRecord(ctx, tasks).live?.version).toBe(1);
    expect(getBoardRecord(ctx, tasks).draft).toBeNull();
    expect(findCollection(ctx.db, 'Ideas')).toBeDefined();
    expect(findCollection(ctx.db, 'Implementación')).toBeDefined();
  });

  it('works from either board of the set', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    publishBoard(ctx, tasks, { moves: {}, by: you, alongside: [ideas] }, now);
    expect(getBoardRecord(ctx, ideas).live?.version).toBe(1);
    expect(getBoardRecord(ctx, tasks).live?.version).toBe(1);
  });

  it('is all or nothing: a stale draft leaves the other board unpublished too', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    expect(() =>
      publishBoard(
        ctx,
        ideas,
        { moves: {}, by: you, alongside: [tasks], draftStamp: 'stale' },
        now,
      ),
    ).toThrow(OteaError);
    expect(getBoardRecord(ctx, ideas).live).toBeNull();
    expect(getBoardRecord(ctx, tasks).live).toBeNull();
  });

  it('refuses a board the set did not make with it', () => {
    const ctx = memoryContext();
    const { ideas } = ideasSet(ctx);
    const other = createBoard(ctx, { name: 'Otra', lang: 'es' }, now);
    expect(() =>
      publishBoard(ctx, ideas, { moves: {}, by: you, alongside: [other.id] }, now),
    ).toThrow(/not made with/);
    expect(getBoardRecord(ctx, ideas).live).toBeNull();
  });

  it('refuses a board of the set that is already live', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    publishBoard(ctx, tasks, { moves: {}, by: you }, now);
    expect(() => publishBoard(ctx, ideas, { moves: {}, by: you, alongside: [tasks] }, now)).toThrow(
      /already published/,
    );
  });
});

describe('restoreBoard alongside', () => {
  it('undoes the joint first publish: both boards are drafts again, nothing live', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    publishBoard(ctx, ideas, { moves: {}, by: you, alongside: [tasks] }, now);
    const record = restoreBoard(ctx, ideas, { version: null, by: you, alongside: [tasks] }, now);
    expect(record.live).toBeNull();
    expect(getBoardRecord(ctx, tasks).live).toBeNull();
    expect(getBoardRecord(ctx, tasks).draft).not.toBeNull();
    expect(findCollection(ctx.db, 'Implementación')).toBeUndefined();
  });

  it('refuses to undo alongside anything but a first publish', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    publishBoard(ctx, ideas, { moves: {}, by: you, alongside: [tasks] }, now);
    expect(() =>
      restoreBoard(ctx, ideas, { version: 1, by: you, alongside: [tasks] }, now),
    ).toThrow(OteaError);
    expect(getBoardRecord(ctx, tasks).live?.version).toBe(1);
  });
});

describe('discarding a board its set made boards with', () => {
  const gone = (ctx: Context, id: string) => {
    try {
      getBoardRecord(ctx, id);
      return false;
    } catch {
      return true;
    }
  };

  it('takes the never-published drafts made with it too: none is left over', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    expect(discardDraft(ctx, ideas, now)).toEqual({ deleted: true });
    expect(gone(ctx, ideas)).toBe(true);
    expect(gone(ctx, tasks)).toBe(true);
  });

  it('keeps a board made with it that is already published', () => {
    const ctx = memoryContext();
    const { ideas, tasks } = ideasSet(ctx);
    publishBoard(ctx, tasks, { moves: {}, by: you, alongside: [ideas] }, now);
    discardDraft(ctx, ideas, now);
    expect(getBoardRecord(ctx, tasks).live?.version).toBe(1);
  });
});
