import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, listItems, moveItem, showItem, updateItem } from './items.ts';
import { claimItem, heartbeatItem, releaseItem } from './leases.ts';
import { memoryContext } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const claude: Actor = { kind: 'agent', name: 'claude' };
const codex: Actor = { kind: 'agent', name: 'codex' };
const human: Actor = { kind: 'human', name: 'human' };

const T0 = '2026-01-01T00:00:00.000Z';
const T5 = '2026-01-01T00:05:00.000Z';
const T15 = '2026-01-01T00:15:00.000Z';
const T20 = '2026-01-01T00:20:00.000Z';

const at = (time: string) => () => time;

describe('leases', () => {
  let ctx: Context;

  const events = (id = 'TASKS-1') => getItem(ctx, id, at(T0)).events;
  const lastEvent = () => events().at(-1);
  const changes = () => Number(ctx.db.prepare('SELECT total_changes() AS n').get()?.n);

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'tasks' });
    const task = { collection: 'tasks', fields: { description: 'Details' }, actor: ana };
    createItem(ctx, { ...task, title: 'First' }, at(T0));
    createItem(ctx, { ...task, title: 'Second' }, at(T0));
  });

  afterEach(() => ctx.db.close());

  describe('claimItem', () => {
    it('holds a free item for the actor for 15 minutes by default', () => {
      const item = claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));

      expect(item).toMatchObject({ id: 'TASKS-1', lease: { holder: 'claude', expiresAt: T15 } });
      expect(getItem(ctx, 'TASKS-1', at(T5)).lease).toEqual({ holder: 'claude', expiresAt: T15 });
    });

    it('records a claimed event with the holder and the expiry', () => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude, ttlMs: 300_000 }, at(T0));

      expect(lastEvent()).toMatchObject({
        type: 'claimed',
        actor: claude,
        at: T0,
        data: { holder: 'claude', expiresAt: T5 },
      });
    });

    it('refuses an item actively held by someone else with lease_held, writing nothing', () => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));

      const claim = () => claimItem(ctx, { id: 'TASKS-1', actor: codex }, at(T5));

      expect(claim).toThrow(expect.objectContaining({ code: 'lease_held' }));
      expect(claim).toThrow(`TASKS-1 is held by claude until ${T15}`);
      expect(getItem(ctx, 'TASKS-1', at(T5)).lease?.holder).toBe('claude');
      expect(events()).toHaveLength(2);
    });

    it('extends the lease when the holder claims again, without a new event', () => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));

      const item = claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T5));

      expect(item.lease).toEqual({ holder: 'claude', expiresAt: T20 });
      expect(events().map(({ type }) => type)).toEqual(['created', 'claimed']);
    });

    it('takes over an expired lease and records the previous holder', () => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));

      const item = claimItem(ctx, { id: 'TASKS-1', actor: codex, ttlMs: 300_000 }, at(T15));

      expect(item.lease).toEqual({ holder: 'codex', expiresAt: T20 });
      expect(lastEvent()?.data).toEqual({ holder: 'codex', expiresAt: T20, previous: 'claude' });
    });

    it('refuses an item whose turn is not the agent with not_claimable', () => {
      moveItem(ctx, { id: 'TASKS-1', to: 'in_progress', actor: claude, channel: 'cli' });
      moveItem(ctx, { id: 'TASKS-1', to: 'review', actor: claude, channel: 'cli' });

      const claim = () => claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));

      expect(claim).toThrow(expect.objectContaining({ code: 'not_claimable' }));
      expect(claim).toThrow('TASKS-1 is in review (turn human); only items on the agent turn');
    });

    it('fails with not_found for an unknown item', () => {
      const claim = () => claimItem(ctx, { id: 'TASKS-9', actor: claude });

      expect(claim).toThrow(expect.objectContaining({ code: 'not_found' }));
    });
  });

  describe('heartbeatItem', () => {
    beforeEach(() => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    });

    it('extends the active lease of the holder without recording an event', () => {
      const item = heartbeatItem(ctx, { id: 'TASKS-1', actor: claude }, at(T5));

      expect(item.lease).toEqual({ holder: 'claude', expiresAt: T20 });
      expect(events()).toHaveLength(2);
    });

    it('accepts a ttl', () => {
      const item = heartbeatItem(ctx, { id: 'TASKS-1', actor: claude, ttlMs: 60_000 }, at(T5));

      expect(item.lease?.expiresAt).toBe('2026-01-01T00:06:00.000Z');
    });

    it('refuses another actor with not_lease_holder', () => {
      const beat = () => heartbeatItem(ctx, { id: 'TASKS-1', actor: codex }, at(T5));

      expect(beat).toThrow(expect.objectContaining({ code: 'not_lease_holder' }));
      expect(beat).toThrow(`TASKS-1 is held by claude until ${T15}`);
    });

    it('refuses the former holder once the lease expired', () => {
      const beat = () => heartbeatItem(ctx, { id: 'TASKS-1', actor: claude }, at(T15));

      expect(beat).toThrow(expect.objectContaining({ code: 'not_lease_holder' }));
      expect(beat).toThrow('TASKS-1 is not held by claude; claim it first');
    });
  });

  describe('releaseItem', () => {
    beforeEach(() => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    });

    it('drops the lease and records a released event', () => {
      const item = releaseItem(ctx, { id: 'TASKS-1', actor: claude }, at(T5));

      expect(item.lease).toBeNull();
      expect(getItem(ctx, 'TASKS-1', at(T5)).lease).toBeNull();
      expect(lastEvent()).toMatchObject({
        type: 'released',
        actor: claude,
        at: T5,
        data: { holder: 'claude', cause: 'release' },
      });
    });

    it('lets another agent claim it right away', () => {
      releaseItem(ctx, { id: 'TASKS-1', actor: claude }, at(T5));

      expect(claimItem(ctx, { id: 'TASKS-1', actor: codex }, at(T5)).lease?.holder).toBe('codex');
    });

    it('refuses an actor that does not hold it with not_lease_holder', () => {
      const release = () => releaseItem(ctx, { id: 'TASKS-1', actor: codex }, at(T5));

      expect(release).toThrow(expect.objectContaining({ code: 'not_lease_holder' }));
      expect(events()).toHaveLength(2);
    });
  });

  describe('reads', () => {
    beforeEach(() => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    });

    it('report an expired lease as free', () => {
      expect(getItem(ctx, 'TASKS-1', at(T15)).lease).toBeNull();
      expect(showItem(ctx, 'TASKS-1', { actor: codex, channel: 'cli' }, at(T15)).lease).toBeNull();
      expect(listItems(ctx, {}, at(T15)).map(({ lease }) => lease)).toEqual([null, null]);
    });

    it('keep a lease that ran out without a release apart, as expiredLease', () => {
      const expired = { holder: 'claude', expiresAt: T15 };

      expect(getItem(ctx, 'TASKS-1', at(T5)).expiredLease).toBeUndefined();
      expect(getItem(ctx, 'TASKS-1', at(T15)).expiredLease).toEqual(expired);
      expect(listItems(ctx, {}, at(T20)).map((item) => item.expiredLease)).toEqual([
        expired,
        undefined,
      ]);
      claimItem(ctx, { id: 'TASKS-1', actor: codex }, at(T20));
      expect(getItem(ctx, 'TASKS-1', at(T20)).expiredLease).toBeUndefined();
    });

    it('write nothing, even when the lease has expired', () => {
      const before = changes();

      getItem(ctx, 'TASKS-1', at(T20));
      showItem(ctx, 'TASKS-1', { actor: codex, channel: 'cli' }, at(T20));
      listItems(ctx, {}, at(T20));

      expect(changes()).toBe(before);
    });

    it('hide items actively held by others when listing what is available to an actor', () => {
      const ids = (actor: string, time: string) =>
        listItems(ctx, { availableTo: actor }, at(time)).map(({ id }) => id);

      expect(ids('codex', T5)).toEqual(['TASKS-2']);
      expect(ids('claude', T5)).toEqual(['TASKS-1', 'TASKS-2']);
      expect(ids('codex', T15)).toEqual(['TASKS-1', 'TASKS-2']);
    });
  });

  describe('writes on a held item', () => {
    beforeEach(() => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    });

    const move = (to: string, actor: Actor, time = T5, reason?: string) =>
      moveItem(
        ctx,
        {
          id: 'TASKS-1',
          to,
          actor,
          channel: actor.kind === 'human' ? 'ui' : 'cli',
          ...(reason ? { reason } : {}),
        },
        at(time),
      );

    it('refuses a move by another agent with lease_held, writing nothing', () => {
      expect(() => move('in_progress', codex)).toThrow(
        expect.objectContaining({ code: 'lease_held' }),
      );
      expect(getItem(ctx, 'TASKS-1', at(T5))).toMatchObject({ state: 'todo', updatedAt: T0 });
    });

    it('refuses an update by another agent with lease_held', () => {
      const update = () => updateItem(ctx, { id: 'TASKS-1', title: 'Mine', actor: codex }, at(T5));

      expect(update).toThrow(expect.objectContaining({ code: 'lease_held' }));
      expect(getItem(ctx, 'TASKS-1', at(T5)).title).toBe('First');
    });

    it('lets the holder update and move it while the turn stays with the agent', () => {
      updateItem(ctx, { id: 'TASKS-1', title: 'Clear', actor: claude }, at(T5));
      const moved = move('in_progress', claude);

      expect(moved.lease).toEqual({ holder: 'claude', expiresAt: T15 });
      expect(events().map(({ type }) => type)).toEqual([
        'created',
        'claimed',
        'updated',
        'transitioned',
      ]);
    });

    it('lets another agent write once the lease expired', () => {
      expect(move('in_progress', codex, T15)).toMatchObject({ state: 'in_progress', lease: null });
    });

    it('releases the lease when the item moves to the human turn', () => {
      move('in_progress', claude);
      const moved = move('review', claude);

      expect(moved.lease).toBeNull();
      expect(getItem(ctx, 'TASKS-1', at(T5)).lease).toBeNull();
      expect(events().slice(-2)).toMatchObject([
        { type: 'transitioned', data: { from: 'in_progress', to: 'review' } },
        { type: 'released', actor: claude, at: T5, data: { holder: 'claude', cause: 'handoff' } },
      ]);
    });

    it('lets the human in the ui act regardless of the lease, releasing it on handoff', () => {
      const moved = move('discarded', human, T5, 'Not needed');

      expect(moved).toMatchObject({ state: 'discarded', lease: null });
      expect(lastEvent()).toMatchObject({
        type: 'released',
        actor: human,
        data: { holder: 'claude', cause: 'handoff' },
      });
    });

    it('records no release when the lease had already expired', () => {
      move('in_progress', claude);
      move('review', codex, T15);

      expect(lastEvent()?.type).toBe('transitioned');
    });
  });
});
