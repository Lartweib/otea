import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import { OteaError } from '../core/errors.ts';
import { findCollection } from '../store/queries.ts';
import {
  createBoardSet,
  getBoardRecord,
  publishBoard,
  publishPair,
  restorePair,
  saveDraft,
} from './boards.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

// Cambios en varios repos: Cambios (the parent, split into) Tareas de repo (the child).
function pairOf(ctx: Context) {
  const [parent, child] = createBoardSet(
    ctx,
    { set: 'repos', lang: 'es', boards: [] },
    now,
    sequenceIds(),
  );
  if (!parent || !child) throw new Error('no pair');
  return { parent: parent.id, child: child.id };
}

const stampOf = (ctx: Context, id: string) => getBoardRecord(ctx, id).draft?.updatedAt ?? null;

describe('publishPair', () => {
  it('publishes both drafts in one go, the child first, and each one is live', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    const result = publishPair(
      ctx,
      {
        ...ids,
        moves: { parent: {}, child: {} },
        draftStamps: { parent: stampOf(ctx, ids.parent), child: stampOf(ctx, ids.child) },
        by: you,
      },
      now,
    );
    expect(result.parent?.version).toBe(1);
    expect(result.child?.version).toBe(1);
    expect(getBoardRecord(ctx, ids.parent).live?.version).toBe(1);
    expect(getBoardRecord(ctx, ids.child).live?.version).toBe(1);
    expect(findCollection(ctx.db, 'Cambios')).toBeDefined();
    expect(findCollection(ctx.db, 'Tareas de repo')).toBeDefined();
  });

  it('publishes only the board asked for when only one has changes', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    publishPair(ctx, { ...ids, moves: { parent: {}, child: {} }, by: you }, now);
    const parent = getBoardRecord(ctx, ids.parent).live?.definition;
    if (!parent) throw new Error('not live');
    saveDraft(
      ctx,
      ids.parent,
      { definition: { ...parent, about: 'Otra cosa' }, baseVersion: 1 },
      now,
    );
    const result = publishPair(ctx, { ...ids, moves: { parent: {} }, by: you }, now);
    expect(result.parent?.version).toBe(2);
    expect(result.child).toBeNull();
    expect(getBoardRecord(ctx, ids.child).live?.version).toBe(1);
  });

  it('is all or nothing: a parent whose draft changed since the plan leaves the child unpublished too', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    expect(() =>
      publishPair(
        ctx,
        {
          ...ids,
          moves: { parent: {}, child: {} },
          draftStamps: { parent: '1999-01-01T00:00:00.000Z' },
          by: you,
        },
        now,
      ),
    ).toThrow(OteaError);
    expect(getBoardRecord(ctx, ids.child).live).toBeNull();
    expect(getBoardRecord(ctx, ids.parent).live).toBeNull();
    expect(findCollection(ctx.db, 'Tareas de repo')).toBeUndefined();
  });

  it('refuses boards that are not one pair', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    expect(() =>
      publishPair(
        ctx,
        { parent: ids.child, child: ids.parent, moves: { parent: {} }, by: you },
        now,
      ),
    ).toThrow(/not split into/);
    expect(() => publishPair(ctx, { ...ids, moves: {}, by: you }, now)).toThrow(/nothing/i);
  });
});

describe('restorePair', () => {
  it('undoes a joint first publish: both boards are drafts again, nothing live', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    publishPair(ctx, { ...ids, moves: { parent: {}, child: {} }, by: you }, now);
    const restored = restorePair(
      ctx,
      { ...ids, versions: { parent: null, child: null }, by: you },
      now,
    );
    expect(restored.parent?.live).toBeNull();
    expect(restored.child?.live).toBeNull();
    expect(restored.parent?.draft).not.toBeNull();
    expect(restored.child?.draft).not.toBeNull();
    expect(findCollection(ctx.db, 'Cambios')).toBeUndefined();
    expect(findCollection(ctx.db, 'Tareas de repo')).toBeUndefined();
  });

  it('is all or nothing: a child with items since keeps both boards published', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    publishPair(ctx, { ...ids, moves: { parent: {}, child: {} }, by: you }, now);
    const formOf = (id: string) => {
      const def = getBoardRecord(ctx, id).live?.definition;
      return Object.fromEntries((def?.form ?? []).map(({ ref }) => [ref, 'api']));
    };
    const change = createItem(ctx, {
      collection: 'Cambios',
      title: 'Nube',
      fields: formOf(ids.parent),
      actor: you,
      channel: 'ui',
    });
    const child = getBoardRecord(ctx, ids.child).live?.definition;
    const idOf = (name: string) =>
      Object.values(child?.parts ?? {}).find((part) => part.name === name)?.id ?? name;
    // A Tarea de repo is always part of a Cambio.
    createItem(ctx, {
      collection: 'Tareas de repo',
      parent: change.id,
      title: 'API',
      fields: {
        ...formOf(ids.child),
        [idOf('Repo')]: 'api',
        [idOf('Rama')]: 'feat/nube',
        [idOf('Qué propone')]: 'Una ruta nueva',
      },
      actor: you,
      channel: 'ui',
    });
    expect(() =>
      restorePair(ctx, { ...ids, versions: { parent: null, child: null }, by: you }, now),
    ).toThrow(OteaError);
    expect(getBoardRecord(ctx, ids.parent).live?.version).toBe(1);
    expect(getBoardRecord(ctx, ids.child).live?.version).toBe(1);
  });

  it('restores only the board named', () => {
    const ctx = memoryContext();
    const ids = pairOf(ctx);
    publishBoard(ctx, ids.child, { moves: {}, by: you }, now);
    const restored = restorePair(ctx, { ...ids, versions: { child: null }, by: you }, now);
    expect(restored.parent).toBeNull();
    expect(restored.child?.live).toBeNull();
  });
});
