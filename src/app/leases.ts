import { positionOf } from '../core/board/engine.ts';
import { placeText } from '../core/board/next.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, DEFAULT_LEASE_TTL_MS, heldText, leaseExpiry } from '../core/lease.ts';
import { turnOf } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, clearLease, type ItemRecord, takeLease } from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Item, present, requireWritableItem, systemClock, workflowOf } from './items.ts';
import { takeItem } from './lease-take.ts';
import { assertMayClaim, liveBoardOf, setAsideRefusal, wantedNowRefusal } from './next.ts';

// `later`: on a release, the agent sets the item aside for later (P3C-R2-4): next and wait leave it
// out for every agent, as the person's wish (P7-R3-6), until it moves, an agent claims it, or the
// set-aside lifts (app/set-aside.ts). `quote`: with `later`, the person's words asking for it later
// again, relayed after they took it up again (P7-R3-8).
export type LeaseInput = {
  id: string;
  actor: Actor;
  ttlMs?: number;
  later?: boolean;
  quote?: string;
};

function notHolder(item: ItemRecord, actor: Actor, at: string): OteaError {
  const lease = activeLease(item.lease, at);
  const message = lease
    ? `${heldText(item.id, lease)}, not by ${actor.name}: only ${lease.holder} can renew or release it`
    : `${item.id} is not held by ${actor.name}; claim it first`;
  return new OteaError('not_lease_holder', message);
}

// `tookOver`: the agent whose lease the claim took over, its session ended (takeItem).
export function claimItem(
  ctx: Context,
  input: LeaseInput,
  now = systemClock,
): Item & { tookOver?: string } {
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
    const at = now();
    assertMayClaim(ctx, item, input.actor.name, at);
    const held = activeLease(item.lease, at)?.holder;
    const lease = takeItem(db, item, input.actor, at, input.ttlMs);
    const claimed = present({ ...item, lease }, workflow, at);
    return held !== undefined && held !== input.actor.name
      ? { ...claimed, tookOver: held }
      : claimed;
  });
}

export function heartbeatItem(ctx: Context, input: LeaseInput, now = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireWritableItem(db, input.id);
    const at = now();
    const current = activeLease(item.lease, at);
    if (current?.holder !== input.actor.name) throw notHolder(item, input.actor, at);
    // A ttl given sets the lease from now; none extends it, never shortening a longer one.
    const extended = leaseExpiry(at, input.ttlMs ?? DEFAULT_LEASE_TTL_MS);
    const keep = input.ttlMs === undefined && current.expiresAt > extended;
    const lease = { holder: current.holder, expiresAt: keep ? current.expiresAt : extended };
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
    // An item nobody holds is set aside for later too: an agent that let it go with a plain release
    // when the person wanted it later sets it aside without claiming it again (P3C-R3-2).
    const aside = input.later === true && current === null;
    if (!aside && current?.holder !== input.actor.name) throw notHolder(item, input.actor, at);
    // What is not agent work right now comes back on its own: setting it aside would only hide it
    // once it does (P7-R3-1).
    const refused = input.later ? setAsideRefusal(ctx, item) : undefined;
    if (refused && current) {
      const plain = `${refused.message} To let go of it: otea release ${item.id}`;
      throw new OteaError(refused.code, plain);
    }
    if (refused) throw refused;
    const quote = input.later ? input.quote?.trim() : undefined;
    const wanted = input.later ? wantedNowRefusal(ctx, item, quote) : undefined;
    if (wanted) throw wanted;
    clearLease(db, item.id);
    const holder = current?.holder ?? input.actor.name;
    const data = { holder, cause: input.later ? 'later' : 'release', ...(quote ? { quote } : {}) };
    appendEvent(db, { itemId: item.id, type: 'released', actor: input.actor, at, data });
    return present({ ...item, lease: null }, workflowOf(ctx, item), at);
  });
}
