import { type AgentChannel, authorizeRelay } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { assertCanLeave } from '../core/fields.ts';
import type { Actor } from '../core/item.ts';
import { activeLease } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import { typeOfItem } from './collections.ts';
import type { Context } from './context.ts';
import { type Item, landMove, requireItem, systemClock } from './items.ts';
import { assertMayEnter } from './relations.ts';

// The human a relayed decision belongs to: the same actor the web UI records.
export const RELAYED_HUMAN: Actor = { kind: 'human', name: 'human' };

// `via` names the agent relaying what the human decided in conversation, `channel` the one it
// used; `quote` is what the human said.
export type RelayInput = {
  id: string;
  to: string;
  via: string;
  channel: AgentChannel;
  quote: string;
  reason?: string;
};

// A decision the human made in conversation, recorded by an agent. It is the human's, so like a
// move in the web UI it is not bound by another agent's lease, and it is always marked as relayed.
export function relayDecision(ctx: Context, input: RelayInput, now = systemClock): Item {
  const quote = input.quote.trim();
  if (!quote) {
    throw new OteaError(
      'quote_required',
      'A relayed decision needs a quote of what the human said',
    );
  }
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const type = typeOfItem(ctx, item);
    const { workflow } = type;
    const { to, reason, via, channel } = input;
    authorizeRelay(workflow, item.state, to, reason);
    assertCanLeave(type, item.state, to, item.fields);
    const at = now();
    assertMayEnter(ctx, item, workflow, to, at);
    const move = { to, actor: RELAYED_HUMAN, at, lease: activeLease(item.lease, at) };
    const data = { ...(reason ? { reason } : {}), channel, quote, source: 'conversation' };
    return landMove(db, workflow, item, move, data, { via });
  });
}
