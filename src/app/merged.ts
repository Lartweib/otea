import type { Channel } from '../core/authority.ts';
import { isClosed, landStepOf, positionOf, reopenStep, stateOf } from '../core/board/engine.ts';
import { MERGED, type Merged, mergedFrom } from '../core/board/merged.ts';
import { DONE, guardedBranch } from '../core/board/model.ts';
import { reopenedText } from '../core/board/next.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, selectEvents } from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Item, landMove, requireWritableItem, systemClock, workflowOf } from './items.ts';
import { liveBoardOf } from './next.ts';

export type { Merged };

export type MarkMergedInput = {
  id: string;
  actor: Actor;
  channel: Channel;
  pr?: string;
  commit?: string;
  // What the forge says of the PR (gh pr view): its state and head branch, when it could be read.
  forge?: { state: string; head: string };
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
    // A merge the forge contradicts is refused: a wrong mark would freeze the item for good.
    const { forge } = input;
    const pr = input.pr?.trim() ?? '';
    if (forge && forge.state.toUpperCase() !== 'MERGED')
      throw new OteaError(
        'invalid_transition',
        `Not marked ${id} merged: its PR ${pr} is ${forge.state.toLowerCase()}, not merged. Merge it first, then otea merged ${id} --pr ${pr}.`,
        { kind: 'pr_not_merged', item: id, state: forge.state },
      );
    if (forge && branch !== '' && forge.head !== branch)
      throw new OteaError(
        'invalid_transition',
        `Not marked ${id} merged: its PR ${pr} merges ${forge.head}, not ${id}'s branch ${branch}.`,
        { kind: 'pr_other_branch', item: id, head: forge.head },
      );
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

export type ReopenInput = { id: string; actor: Actor; channel: Channel; reason: string };

// Takes a Done item whose branch is not merged yet back to the step that pushes its branch: its PR
// stopped merging as it is (another branch merged first and now conflicts) and its branch, frozen
// while it is Done, must change. Whoever asks (the agent that hits the conflict, or the person)
// says why; the change goes through the step's review again, so the person approves it again.
// Once the branch is merged (marked so, or landed in the board's land step) the item stays Done: a
// further change is new work.
export function reopenItem(
  ctx: Context,
  input: ReopenInput,
  now = systemClock,
): { item: Item; text: string } {
  const { id } = input;
  return transaction(ctx.db, () => {
    const item = requireWritableItem(ctx.db, id);
    const position = positionOf(item.state);
    const refuse = (kind: 'not_done' | 'merged_already' | 'no_branch', text: string): never => {
      throw new OteaError('invalid_transition', text, { kind, item: id });
    };
    if (!isClosed(position) || position.closed !== DONE)
      refuse(
        'not_done',
        `${id} is not Done: only a Done item whose branch is not merged yet reopens`,
      );
    if (mergedOf(ctx, id))
      refuse(
        'merged_already',
        `${id} is merged already: its branch is in, so a further change is new work, not ${id}`,
      );
    const board = liveBoardOf(ctx, item.collection);
    // On a board with a land step, an agent merged the item there before it was Done.
    const land = board ? landStepOf(board.def) : undefined;
    if (land)
      refuse(
        'merged_already',
        `${id} was merged in ${land.name} already: its branch is in, so a further change is new work, not ${id}`,
      );
    const step = board ? reopenStep(board.def) : undefined;
    if (!board || step === undefined)
      return refuse('no_branch', `${id} protects no branch: there is nothing to reopen it for`);
    if (!input.reason.trim())
      throw new OteaError(
        'reason_required',
        `Reopening ${id} needs a reason: why its branch must change`,
        { kind: 'way_back_reason', item: id },
      );
    const to = stateOf({ step, phase: 'doing' });
    const at = now();
    const moved = landMove(
      ctx.db,
      workflowOf(ctx, item),
      item,
      { to, actor: input.actor, at, lease: activeLease(item.lease, at), board: true },
      { reason: input.reason.trim(), reopened: true, channel: input.channel },
    );
    return { item: moved, text: reopenedText(board.def, id, step) };
  });
}
