import { type AgentChannel, authorizeRelay } from '../core/authority.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { stepById } from '../core/board/model.ts';
import { OteaError } from '../core/errors.ts';
import { assertCanLeave } from '../core/fields.ts';
import type { Actor } from '../core/item.ts';
import { activeLease } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import { type EventRecord, type ItemRecord, selectEvents } from '../store/queries.ts';
import { typeOfItem } from './collections.ts';
import type { Context } from './context.ts';
import { type Item, landMove, requireWritableItem, systemClock } from './items.ts';
import { assertMoveHandsOff, boardState, liveBoardOf, roundWorkersOf } from './next.ts';
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
    const item = requireWritableItem(db, input.id);
    const type = typeOfItem(ctx, item);
    const { workflow } = type;
    const { reason, via, channel } = input;
    const to = boardState(ctx, item.collection, input.to);
    // On a board the engine says first: a discard the person makes only on the page, an approval
    // whose parts are not finished.
    const note = assertMoveHandsOff(ctx, item, to, RELAYED_HUMAN, {
      ...(reason === undefined ? {} : { reason }),
      via: 'relay',
    });
    authorizeRelay(workflow, item.state, to, reason);
    assertCanLeave(type, item.state, to, item.fields);
    const at = now();
    assertMayEnter(ctx, item, workflow, to, at);
    assertNotOwnStep(ctx, item, via);
    const board = liveBoardOf(ctx, item.collection) !== undefined;
    const move = { to, actor: RELAYED_HUMAN, at, lease: activeLease(item.lease, at), board };
    const data = {
      ...(reason ? { reason } : {}),
      ...(note ? { note } : {}),
      channel,
      quote,
      source: 'conversation',
    };
    return landMove(db, workflow, item, move, data, { via });
  });
}

// A move the agent made itself, not one it relayed (a relayed move is the human's).
function movedBy(event: EventRecord, agent: string): boolean {
  const { type, actor } = event;
  return type === 'transitioned' && actor.kind === 'agent' && actor.name === agent;
}

// The step `agent` did itself in the round the item is in. On a board: one of the agents that did
// the step in its current round (next.ts roundWorkersOf). Off a board: the state it left with the move
// that brought the item where it is.
function ownStep(ctx: Context, item: ItemRecord, agent: string): string | undefined {
  const events = selectEvents(ctx.db, item.id);
  const board = liveBoardOf(ctx, item.collection);
  if (!board) {
    const last = events.findLast(({ type }) => type === 'transitioned');
    return last && movedBy(last, agent) ? String(last.data.from) : undefined;
  }
  const position = positionOf(item.state);
  if (isClosed(position) || !roundWorkersOf(ctx, item, board.def).includes(agent)) return undefined;
  return stepById(board.def, position.step)?.name ?? position.step;
}

// An agent relays the human's decisions, never one on its own work: the human makes that one in
// the web UI, where nobody speaks for them.
function assertNotOwnStep(ctx: Context, item: ItemRecord, via: string): void {
  const step = ownStep(ctx, item, via);
  if (step === undefined) return;
  throw new OteaError(
    'forbidden',
    `Not relayed: ${via} did ${step} on ${item.id} in this round, so it may not relay the decision on its own work; the person makes it in the web UI.`,
    { kind: 'own_step', item: item.id, step, who: via },
  );
}
