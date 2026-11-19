import { isClosed, positionOf } from '../core/board/engine.ts';
import { guardedBranch } from '../core/board/model.ts';
import { type ItemRecord, selectEvents, selectItems } from '../store/queries.ts';
import type { Context } from './context.ts';
import { sameRepo } from './gates.ts';
import { liveBoardOf, liveBoards } from './next.ts';

// When an item came to name the value its field holds now: the last update that set it, or else
// its creation.
function namedAt(ctx: Context, item: ItemRecord, key: string): string {
  const now = item.fields[key];
  const set = selectEvents(ctx.db, item.id).findLast(({ type, data }) => {
    const changes = data.changes as Record<string, { to?: unknown }> | undefined;
    return type === 'updated' && changes?.[key] !== undefined && changes[key].to === now;
  });
  return set?.at ?? item.createdAt;
}

// The open item, of any board, that names `branch` as its protected branch and named it before
// `item` did (P1-R3-1): each item works on its own branch, and a second item naming one would have
// its review read the other's work and its approval keep the other's tip. The item that named it
// first keeps it, so the mistake of the later one never blocks it. Items on another repo (a board
// whose guard reads one) and closed items never count. Undefined when none does.
export function branchNamedFirst(
  ctx: Context,
  item: ItemRecord,
  branch: string,
): ItemRecord | undefined {
  const own = liveBoardOf(ctx, item.collection);
  const guard = own && guardedBranch(own.def);
  if (!guard) return undefined;
  const repo = guard.guard.repo === undefined ? undefined : item.fields[guard.guard.repo];
  const mine = namedAt(ctx, item, guard.id);
  const before = (other: ItemRecord, at: string) =>
    at < mine || (at === mine && other.createdAt < item.createdAt);
  let first: { item: ItemRecord; at: string } | undefined;
  for (const board of liveBoards(ctx)) {
    const part = guardedBranch(board.def);
    if (!part) continue;
    for (const other of selectItems(ctx.db, { collection: board.collection })) {
      if (other.id === item.id || other.fields[part.id] !== branch) continue;
      if (isClosed(positionOf(other.state))) continue;
      const theirs = part.guard.repo === undefined ? undefined : other.fields[part.guard.repo];
      if (typeof repo === 'string' && typeof theirs === 'string' && !sameRepo(theirs, repo))
        continue;
      const at = namedAt(ctx, other, part.id);
      if (before(other, at) && (!first || at < first.at)) first = { item: other, at };
    }
  }
  return first?.item;
}
