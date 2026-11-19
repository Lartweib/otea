import { isClosed, positionOf } from '../core/board/engine.ts';
import { selectEvents } from '../store/queries.ts';
import type { Context } from './context.ts';

// The commit and tree of a branch an agent handed off for review (recorded with its handoff): what
// the person approved, which is all the branch may bring in once it is approved. `unchanged`: a
// main-only item handed off with nothing on the base the remote lacks, no code change (P2S-R3-3).
export type Tip = { branch: string; commit: string; tree: string; unchanged?: true };

function isTip(value: unknown): value is Tip {
  if (value === null || typeof value !== 'object') return false;
  const { branch, commit, tree } = value as Record<string, unknown>;
  return typeof branch === 'string' && typeof commit === 'string' && typeof tree === 'string';
}

// What the person approved of an item's branch: the tip its last handoff into a review recorded
// (P3C-R2-1). A later handoff that recorded none (made outside the repo) leaves nothing to hold the
// branch to, never an older round's tip; a tip of another branch holds nothing either.
export function approvedTipOf(ctx: Context, id: string, branch: string): Tip | undefined {
  const tip = lastHandoff(ctx, id)?.data.tip;
  return isTip(tip) && tip.branch === branch ? tip : undefined;
}

// The item's last move into a review: its last handoff.
function lastHandoff(ctx: Context, id: string) {
  return selectEvents(ctx.db, id)
    .filter(({ type }) => type === 'transitioned')
    .filter(({ data }) => {
      const to = positionOf(String(data.to));
      return !isClosed(to) && to.phase !== 'doing';
    })
    .at(-1);
}

// Whether the item was ever handed off into a review: from then on its branch on the remote holds
// what a review read.
export function handedOff(ctx: Context, id: string): boolean {
  return lastHandoff(ctx, id) !== undefined;
}
