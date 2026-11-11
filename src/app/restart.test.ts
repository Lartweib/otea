import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem } from './items.ts';
import { claimItem } from './leases.ts';
import { reassignItem, restartItem, undoRelease } from './restart.ts';
import { memoryContext } from './testing.ts';
import { UNDO_WINDOW_MS } from './undo.ts';

// A stuck item (its agent's lease ran out without a release): the person puts it back in the
// queue of its step (Retomar), or leaves it for a chosen agent (Reasignar). Both are a release in
// the item's history, by the person, and both come back with Deshacer while the toast is up.

const you: Actor = { kind: 'human', name: 'human' };
const kiln: Actor = { kind: 'agent', name: 'kiln' };
const quill: Actor = { kind: 'agent', name: 'quill' };

const T0 = '2026-11-11T12:00:00.000Z';
const T1 = '2026-11-11T12:01:00.000Z';
const T30 = '2026-11-11T12:30:00.000Z';
const at = (time: string) => () => time;
const plus = (ms: number) => () => new Date(Date.parse(T30) + ms).toISOString();

describe('a stuck item', () => {
  let ctx: Context;
  const item = () => getItem(ctx, 'TASKS-1', at(T30));
  const last = () => item().events.at(-1);

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'tasks' });
    createItem(
      ctx,
      {
        collection: 'tasks',
        title: 'Trot cycle',
        fields: { description: 'Twelve frames' },
        actor: you,
      },
      at(T0),
    );
    // kiln claims it for one minute and goes quiet.
    claimItem(ctx, { id: 'TASKS-1', actor: kiln, ttlMs: 60_000 }, at(T0));
  });

  afterEach(() => ctx.db.close());

  describe('Retomar', () => {
    it('releases the lease that ran out and leaves the item in the queue of its step', () => {
      const restarted = restartItem(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, at(T30));

      expect(restarted).toMatchObject({ state: 'todo', turn: 'agent', lease: null });
      expect(restarted.expiredLease).toBeUndefined();
      expect(item().lease).toBeNull();
      expect(last()).toMatchObject({
        type: 'released',
        actor: you,
        data: { holder: 'kiln', cause: 'restart', channel: 'ui', expiresAt: T1 },
      });
    });

    it('lets any agent claim it then, the one that went quiet too', () => {
      restartItem(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, at(T30));

      expect(claimItem(ctx, { id: 'TASKS-1', actor: quill }, at(T30)).lease?.holder).toBe('quill');
    });

    it('refuses an item whose lease is still running, or that has none', () => {
      claimItem(ctx, { id: 'TASKS-1', actor: quill }, at(T30));
      expect(() => restartItem(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, at(T30))).toThrow(
        expect.objectContaining({ code: 'not_stuck' }),
      );

      createItem(ctx, { collection: 'tasks', title: 'Free', actor: you }, at(T0));
      expect(() => restartItem(ctx, { id: 'TASKS-2', actor: you, channel: 'ui' }, at(T30))).toThrow(
        expect.objectContaining({ code: 'not_stuck' }),
      );
    });
  });

  describe('Reasignar', () => {
    it('releases the lease and records the agent it is left for', () => {
      const left = reassignItem(
        ctx,
        { id: 'TASKS-1', agent: 'quill', actor: you, channel: 'ui' },
        at(T30),
      );

      expect(left).toMatchObject({ state: 'todo', turn: 'agent', lease: null });
      expect(last()).toMatchObject({
        type: 'released',
        actor: you,
        data: { holder: 'kiln', cause: 'reassign', next: 'quill', channel: 'ui' },
      });
    });

    it('expects that agent, without keeping the others out', () => {
      reassignItem(ctx, { id: 'TASKS-1', agent: 'quill', actor: you, channel: 'ui' }, at(T30));

      expect(claimItem(ctx, { id: 'TASKS-1', actor: kiln }, at(T30)).lease?.holder).toBe('kiln');
    });

    it('refuses a name that cannot be an agent', () => {
      expect(() =>
        reassignItem(ctx, { id: 'TASKS-1', agent: 'you', actor: you, channel: 'ui' }, at(T30)),
      ).toThrow(expect.objectContaining({ code: 'invalid_agent_name' }));
      expect(item().expiredLease?.holder).toBe('kiln');
    });
  });

  describe('Deshacer', () => {
    it('gives the lease back as it was, and the pair names each other', () => {
      restartItem(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, at(T30));
      const released = last();

      const back = undoRelease(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, plus(2000));

      expect(back.lease).toBeNull();
      expect(back.expiredLease).toEqual({ holder: 'kiln', expiresAt: T1 });
      expect(last()).toMatchObject({
        type: 'claimed',
        actor: you,
        data: { holder: 'kiln', expiresAt: T1, undoes: released?.id, channel: 'ui' },
      });
    });

    it('takes back a reassign as well', () => {
      reassignItem(ctx, { id: 'TASKS-1', agent: 'quill', actor: you, channel: 'ui' }, at(T30));

      expect(
        undoRelease(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, plus(1000)).expiredLease
          ?.holder,
      ).toBe('kiln');
    });

    it('refuses once an agent took it, once it is undone, or once the toast is long gone', () => {
      const undo = (now = plus(1000)) =>
        undoRelease(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, now);

      restartItem(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, at(T30));
      expect(() => undo(plus(UNDO_WINDOW_MS + 1000))).toThrow(
        expect.objectContaining({ code: 'not_undoable' }),
      );

      undo();
      expect(() => undo()).toThrow(expect.objectContaining({ code: 'not_undoable' }));

      restartItem(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, at(T30));
      claimItem(ctx, { id: 'TASKS-1', actor: quill }, at(T30));
      expect(() => undo()).toThrow(expect.objectContaining({ code: 'not_undoable' }));
      expect(item().lease?.holder).toBe('quill');
    });

    it("refuses an agent's own release", () => {
      claimItem(ctx, { id: 'TASKS-1', actor: quill }, at(T30));
      ctx.db.prepare("UPDATE items SET lease_expires_at = ? WHERE id = 'TASKS-1'").run(T30);
      expect(() =>
        undoRelease(ctx, { id: 'TASKS-1', actor: you, channel: 'ui' }, plus(1000)),
      ).toThrow(expect.objectContaining({ code: 'not_undoable' }));
    });
  });
});
