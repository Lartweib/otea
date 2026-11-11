import type { Channel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { type Actor, assertAgentName } from '../core/item.ts';
import { activeLease } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  clearLease,
  type ItemRecord,
  selectEvents,
  takeLease,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Clock, type Item, present, requireItem, systemClock, workflowOf } from './items.ts';
import { UNDO_WINDOW_MS } from './undo.ts';

// A stuck item: its agent's lease ran out without a release (Atasco). The person, from the UI,
// either puts it back in the queue of its step for any agent to claim (Retomar, cause "restart"),
// or leaves it for a chosen agent (Reasignar, cause "reassign", the agent as "next"). Both drop
// the lease that ran out and are written as a release by the person; the agent left for is
// expected, not enforced: any agent may still claim the item. The person takes either back while
// its toast is up (undoRelease): the lease returns as it was, and the item is stuck again.

export type RestartInput = { id: string; actor: Actor; channel: Channel };
export type ReassignInput = RestartInput & { agent: string };

export const RELEASE_CAUSES = ['restart', 'reassign'] as const;

function releaseStuck(
  ctx: Context,
  input: RestartInput,
  data: { cause: 'restart' } | { cause: 'reassign'; next: string },
  now: Clock,
): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const at = now();
    const ran = stuckLease(item, at);
    clearLease(db, item.id);
    appendEvent(db, {
      itemId: item.id,
      type: 'released',
      actor: input.actor,
      at,
      data: { holder: ran.holder, expiresAt: ran.expiresAt, ...data, channel: input.channel },
    });
    return present({ ...item, lease: null }, workflowOf(ctx, item), at);
  });
}

function stuckLease(item: ItemRecord, at: string) {
  const live = activeLease(item.lease, at);
  if (live) {
    throw new OteaError(
      'not_stuck',
      `${item.id} is held by ${live.holder} until ${live.expiresAt}; it is not stuck`,
    );
  }
  if (!item.lease) throw new OteaError('not_stuck', `${item.id} has no lease that ran out`);
  return item.lease;
}

export function restartItem(ctx: Context, input: RestartInput, now: Clock = systemClock): Item {
  return releaseStuck(ctx, input, { cause: 'restart' }, now);
}

export function reassignItem(ctx: Context, input: ReassignInput, now: Clock = systemClock): Item {
  assertAgentName(input.agent);
  return releaseStuck(ctx, input, { cause: 'reassign', next: input.agent }, now);
}

export function undoRelease(ctx: Context, input: RestartInput, now: Clock = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const at = now();
    const refuse = (why: string): never => {
      throw new OteaError('not_undoable', `${item.id}: ${why}`);
    };
    const last = selectEvents(db, item.id).at(-1);
    const causes: readonly unknown[] = RELEASE_CAUSES;
    if (last?.type !== 'released' || !causes.includes(last.data.cause))
      return refuse('its last change is not a restart or a reassign');
    if (last.actor.kind !== input.actor.kind || last.actor.name !== input.actor.name)
      return refuse('its last restart is not yours');
    if (Date.parse(at) - Date.parse(last.at) > UNDO_WINDOW_MS)
      return refuse('the restart is too old to take back');
    const { holder, expiresAt } = last.data;
    if (typeof holder !== 'string' || typeof expiresAt !== 'string' || item.lease)
      return refuse('its lease cannot be given back');
    const lease = { holder, expiresAt };
    if (!takeLease(db, item.id, lease, at)) return refuse('its lease cannot be given back');
    appendEvent(db, {
      itemId: item.id,
      type: 'claimed',
      actor: input.actor,
      at,
      data: { ...lease, undoes: last.id, channel: input.channel },
    });
    return present({ ...item, lease }, workflowOf(ctx, item), at);
  });
}
