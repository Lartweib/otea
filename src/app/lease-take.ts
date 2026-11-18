import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import {
  activeLease,
  assertMayWrite,
  DEFAULT_LEASE_TTL_MS,
  type Lease,
  leaseExpiry,
  leaseHeld,
} from '../core/lease.ts';
import { timeText } from '../core/time.ts';
import { appendEvent, type ItemRecord, selectEvents, takeLease } from '../store/queries.ts';

// Takes the lease on an item for the actor, inside the caller's transaction, once the caller has
// checked the item is the actor's to claim: refused while another holds it; claiming it again
// extends it. A new holder writes a `claimed` event. Shared by otea claim and otea next --claim.
export function takeItem(
  db: DatabaseSync,
  item: ItemRecord,
  actor: Actor,
  at: string,
  ttlMs = DEFAULT_LEASE_TTL_MS,
): Lease {
  const current = activeLease(item.lease, at);
  if (current && current.holder !== actor.name) throw leaseHeld(item.id, current);
  const lease = { holder: actor.name, expiresAt: leaseExpiry(at, ttlMs) };
  if (!takeLease(db, item.id, lease, at)) throw new OteaError('lease_held', `${item.id} is held`);
  if (!current) {
    const previous = item.lease && item.lease.holder !== actor.name ? item.lease.holder : null;
    const data = previous ? { ...lease, previous } : lease;
    appendEvent(db, { itemId: item.id, type: 'claimed', actor, at, data });
  }
  return lease;
}

// Whether the actor may write the item now: no other agent holds it (assertMayWrite), and an agent
// whose own lease ran out, or that the person freed it from, claims it again first. Its work may
// have gone to another agent meanwhile; writing on as if it still held it would hand off over them.
export function assertMayWriteItem(
  db: DatabaseSync,
  item: ItemRecord,
  actor: Actor,
  at: string,
): void {
  const lease = activeLease(item.lease, at);
  assertMayWrite(item.id, lease, actor);
  if (actor.kind !== 'agent' || lease) return;
  const again = `claim it again before you write: otea claim ${item.id}`;
  if (item.lease?.holder === actor.name) {
    throw new OteaError(
      'not_lease_holder',
      `Your lease on ${item.id} ran out at ${timeText(item.lease.expiresAt)}; ${again}`,
    );
  }
  const last = selectEvents(db, item.id).findLast(
    ({ type }) => type === 'claimed' || type === 'released',
  );
  if (last?.type === 'released' && last.actor.kind === 'human' && last.data.holder === actor.name) {
    throw new OteaError(
      'not_lease_holder',
      `The person freed ${item.id} from you at ${timeText(last.at)}; ${again}`,
    );
  }
}
