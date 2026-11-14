import { positionOf } from '../core/board/engine.ts';
import { placeText } from '../core/board/next.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, DEFAULT_LEASE_TTL_MS, leaseExpiry, leaseHeld } from '../core/lease.ts';
import { turnOf } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, clearLease, type ItemRecord, takeLease } from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Item, present, requireWritableItem, systemClock, workflowOf } from './items.ts';
import { takeItem } from './lease-take.ts';
import { assertMayClaim, liveBoardOf } from './next.ts';

export type LeaseInput = { id: string; actor: Actor; ttlMs?: number };

function notHolder(item: ItemRecord, actor: Actor, at: string): OteaError {
  const lease = activeLease(item.lease, at);
  const message = lease
    ? `${leaseHeld(item.id, lease).message}, not by ${actor.name}: only ${lease.holder} can renew or release it`
    : `${item.id} is not held by ${actor.name}; claim it first`;
  return new OteaError('not_lease_holder', message);
}

export function claimItem(ctx: Context, input: LeaseInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireWritableItem(db, input.id);
    const workflow = workflowOf(ctx, item);
    const turn = turnOf(workflow, item.state);
    if (turn !== 'agent') {
      const board = liveBoardOf(ctx, item.collection);
      const where = board ? placeText(board.def, positionOf(item.state)) : item.state;
      throw new OteaError(
        'not_claimable',
        `${item.id} is in ${where} (turn ${turn}); only items on the agent turn can be claimed`,
      );
    }
    assertMayClaim(ctx, item, input.actor.name);
    const at = now();
    const lease = takeItem(db, item, input.actor, at, input.ttlMs);
    return present({ ...item, lease }, workflow, at);
  });
}

export function heartbeatItem(ctx: Context, input: LeaseInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireWritableItem(db, input.id);
    const at = now();
    const current = activeLease(item.lease, at);
    if (current?.holder !== input.actor.name) throw notHolder(item, input.actor, at);
    const lease = {
      holder: current.holder,
      expiresAt: leaseExpiry(at, input.ttlMs ?? DEFAULT_LEASE_TTL_MS),
    };
    takeLease(db, item.id, lease, at);
    return present({ ...item, lease }, workflowOf(ctx, item), at);
  });
}

export function releaseItem(ctx: Context, input: LeaseInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireWritableItem(db, input.id);
    const at = now();
    const current = activeLease(item.lease, at);
    if (current?.holder !== input.actor.name) throw notHolder(item, input.actor, at);
    clearLease(db, item.id);
    const data = { holder: current.holder, cause: 'release' };
    appendEvent(db, { itemId: item.id, type: 'released', actor: input.actor, at, data });
    return present({ ...item, lease: null }, workflowOf(ctx, item), at);
  });
}
