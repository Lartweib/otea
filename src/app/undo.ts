import type { Channel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, selectEvents, updateItemState } from '../store/queries.ts';
import { typeOfItem } from './collections.ts';
import type { Context } from './context.ts';
import { type Clock, type Item, present, requireItem, systemClock } from './items.ts';

// The person takes back their last move while its toast is still up: the item returns to the state
// it left, outside the workflow's transitions (an approval has no move back). The undo is itself a
// transitioned event that names the event it undoes, so readers can drop the pair.

// The toast stays about 6 s; the undo is honoured a little longer, for a slow click or a slow link.
export const UNDO_WINDOW_MS = 30_000;

export type UndoMoveInput = { id: string; from: string; actor: Actor; channel: Channel };

export function undoMove(ctx: Context, input: UndoMoveInput, now: Clock = systemClock): Item {
  const { db } = ctx;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const at = now();
    const moves = selectEvents(db, item.id).filter((e) => e.type === 'transitioned');
    const last = moves.at(-1);
    const refuse = (why: string): never => {
      throw new OteaError('not_undoable', `${item.id}: ${why}`);
    };
    if (!last) return refuse('it has not moved');
    if (last.data.undoes !== undefined) return refuse('its last move is already undone');
    if (last.actor.kind !== input.actor.kind || last.actor.name !== input.actor.name)
      return refuse('its last move is not yours');
    if (last.data.to !== item.state || last.data.from !== input.from)
      return refuse(`its last move is not from "${input.from}"`);
    if (Date.parse(at) - Date.parse(last.at) > UNDO_WINDOW_MS)
      return refuse('the move is too old to take back');
    const { workflow } = typeOfItem(ctx, item);
    updateItemState(db, item.id, input.from, at);
    appendEvent(db, {
      itemId: item.id,
      type: 'transitioned',
      actor: input.actor,
      at,
      data: { from: item.state, to: input.from, undoes: last.id, channel: input.channel },
    });
    return present({ ...item, state: input.from, updatedAt: at }, workflow, at);
  });
}
