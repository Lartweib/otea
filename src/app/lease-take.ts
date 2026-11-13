import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import {
  activeLease,
  DEFAULT_LEASE_TTL_MS,
  type Lease,
  leaseExpiry,
  leaseHeld,
} from '../core/lease.ts';
import { appendEvent, type ItemRecord, takeLease } from '../store/queries.ts';

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
