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
import {
  appendEvent,
  clearLease,
  type ItemRecord,
  selectEvents,
  takeLease,
} from '../store/queries.ts';
import { sessionEnded, sessionRuns } from './presence.ts';

// Why a claim of an item whose lease ran out is refused while its holder's session runs.
function stillWorking(id: string, lease: Lease): OteaError {
  const { holder } = lease;
  return new OteaError(
    'lease_held',
    `${id} is still ${holder}'s: its lease ran out at ${timeText(lease.expiresAt)}, but its session runs (an MCP server or wait of it), so it may be at work on a long step with no otea call. Take other work: otea next. If ${holder} is stuck, the person frees the item on the desk (Liberar).`,
  );
}

// Takes the lease on an item for the actor, inside the caller's transaction, once the caller has
// checked the item is the actor's to claim: refused while another holds it, unless that agent's
// session ended (P3C-R3-11): its lease is taken over, with `cause: ended`. Claiming it again
// extends it. A new holder writes a `claimed` event. Shared by otea claim and otea next --claim.
export function takeItem(
  db: DatabaseSync,
  item: ItemRecord,
  actor: Actor,
  at: string,
  ttlMs = DEFAULT_LEASE_TTL_MS,
): Lease {
  const held = activeLease(item.lease, at);
  const other = held && held.holder !== actor.name ? held : null;
  const ended = other !== null && sessionEnded(db, other.holder, () => at);
  if (other && !ended) throw leaseHeld(item.id, other);
  // A lease that ran out is no proof its holder stopped (P1-R3-6): while its session runs, the item
  // stays its own.
  const ranOut = !held && item.lease && item.lease.holder !== actor.name ? item.lease : null;
  if (ranOut && sessionRuns(db, ranOut.holder, () => at)) throw stillWorking(item.id, ranOut);
  if (ended) clearLease(db, item.id);
  const lease = { holder: actor.name, expiresAt: leaseExpiry(at, ttlMs) };
  if (!takeLease(db, item.id, lease, at)) throw new OteaError('lease_held', `${item.id} is held`);
  if (!held || ended) {
    const previous = item.lease && item.lease.holder !== actor.name ? item.lease.holder : null;
    const data = previous ? { ...lease, previous, ...(ended ? { cause: 'ended' } : {}) } : lease;
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
