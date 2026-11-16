import type { Channel } from '../core/authority.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { MERGED, type Merged, mergedFrom } from '../core/board/merged.ts';
import { DONE, guardedBranch } from '../core/board/model.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, selectEvents } from '../store/queries.ts';
import type { Context } from './context.ts';
import { requireWritableItem, systemClock } from './items.ts';
import { liveBoardOf } from './next.ts';

export type { Merged };

export type MarkMergedInput = {
  id: string;
  actor: Actor;
  channel: Channel;
  pr?: string;
  commit?: string;
};

export function mergedOf(ctx: Context, id: string): Merged | undefined {
  return mergedFrom(selectEvents(ctx.db, id));
}

// Records that a Done item's branch was merged: after Done the item takes no other change, so this
// is the fact that tells its rows and page the work is in (and not still waiting to be merged).
export function markMerged(ctx: Context, input: MarkMergedInput, now = systemClock): Merged {
  const { id } = input;
  return transaction(ctx.db, () => {
    const item = requireWritableItem(ctx.db, id);
    const position = positionOf(item.state);
    if (!isClosed(position) || position.closed !== DONE)
      throw new OteaError(
        'invalid_transition',
        `${id} is not Done yet: mark it merged once it is Done and its branch is in`,
        { kind: 'not_done', item: id },
      );
    if (mergedOf(ctx, id))
      throw new OteaError('invalid_transition', `${id} is marked merged already`, {
        kind: 'merged_already',
        item: id,
      });
    const board = liveBoardOf(ctx, item.collection);
    const part = board ? guardedBranch(board.def) : undefined;
    const branch = part ? String(item.fields[part.id] ?? '').trim() : '';
    appendEvent(ctx.db, {
      itemId: id,
      type: MERGED,
      actor: input.actor,
      at: now(),
      data: {
        ...(branch === '' ? {} : { branch }),
        ...(input.pr?.trim() ? { pr: input.pr.trim() } : {}),
        ...(input.commit?.trim() ? { commit: input.commit.trim() } : {}),
        channel: input.channel,
      },
    });
    const merged = mergedOf(ctx, id);
    if (!merged) throw new Error(`the merge of ${id} was not kept`);
    return merged;
  });
}
