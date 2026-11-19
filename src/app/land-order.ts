import { isClosed, isLandStep, positionOf } from '../core/board/engine.ts';
import { guardedBranch } from '../core/board/model.ts';
import { activeLease } from '../core/lease.ts';
import { type ItemRecord, selectItems, selectStateEntries } from '../store/queries.ts';
import type { Context } from './context.ts';
import { type LiveBoard, leftFor, liveBoardOf, liveBoards } from './next.ts';
import { sessionEnded } from './presence.ts';
import { type Priority, priorityOf } from './priority.ts';

// One agent lands at a time on a base branch, and the next to land is the item highest in the
// person's order (P1-R3-2): approved items raced into main, the lower and unordered ones landed
// first, and the ones on top conflicted again and again, each conflict another review round. It
// holds on any board's land step (the step an agent integrates what the person approved in,
// however the board names it), across the boards that land in the same base of the same repo.
// The person still moves anything by hand: they reorder the Matrix, put an item on top, move an
// item themselves or leave it for one agent (Reasignar), which lands it when it takes it.

// Where an item stands on a land step: the base it lands in, and the key of that base in its repo
// (boards whose guard reads the repo from a field keep each repo apart). Undefined anywhere else.
function landingIn(board: LiveBoard, item: ItemRecord): { key: string; base: string } | undefined {
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase !== 'doing') return undefined;
  if (!isLandStep(board.def, position.step)) return undefined;
  const guard = guardedBranch(board.def);
  if (!guard) return undefined;
  const base = guard.guard.base ?? 'the base';
  const repo = guard.guard.repo === undefined ? '' : item.fields[guard.guard.repo];
  return { key: `${typeof repo === 'string' ? repo.toLowerCase() : ''}\0${base}`, base };
}

// Why an item comes first in the person's order: what they put on top, their order on the
// Matrix, else that it was approved first.
function placeText(priority: Priority | undefined): string {
  if (priority?.pin !== undefined) return `on top ${priority.pin}`;
  if (priority?.rank !== undefined) return `order ${priority.rank}`;
  return 'approved before it';
}

// What lands before the item: `holder` lands `first` now, or `first` lands next (its `place` in
// the person's order says why).
export type LandsFirst = { first: string; base: string } & ({ holder: string } | { place: string });

// What lands in the item's base before it, for the agent asking; undefined when the item is not on
// a land step, or its turn to land is now. `takeable` says whether the agent could take another
// item now, leaving this order aside: an item no agent can take (a question waits for the person)
// never holds up the ones after it.
export function landsFirst(
  ctx: Context,
  item: ItemRecord,
  agent: string,
  at: string,
  takeable: (board: LiveBoard, item: ItemRecord) => boolean,
): LandsFirst | undefined {
  const board = liveBoardOf(ctx, item.collection);
  const own = board && landingIn(board, item);
  if (!own) return undefined;
  // The person left it for this agent: their say goes.
  if (leftFor(ctx, item.id) === agent) return undefined;
  // Its landing began with this agent, whose lease may have run out meanwhile: it goes on with it.
  if (item.lease?.holder === agent) return undefined;
  const waiting = liveBoards(ctx).flatMap((each) =>
    selectItems(ctx.db, { collection: each.collection }).flatMap((other) =>
      other.id !== item.id && landingIn(each, other)?.key === own.key
        ? [{ item: other, board: each }]
        : [],
    ),
  );
  // A landing under way: another item of the base an agent holds, unless that agent's session
  // ended (a claim takes its lease over then, P3C-R3-11).
  const landing = waiting.flatMap(({ item: other }) => {
    const lease = activeLease(other.lease, at);
    return lease && !sessionEnded(ctx.db, lease.holder, () => at)
      ? [{ first: other.id, base: own.base, holder: lease.holder }]
      : [];
  });
  if (landing[0]) return landing[0];
  const priority = priorityOf(ctx.db);
  const entered = selectStateEntries(ctx.db);
  const key = (each: ItemRecord) => [
    priority.get(each.id)?.pin ?? Number.POSITIVE_INFINITY,
    priority.get(each.id)?.rank ?? Number.POSITIVE_INFINITY,
  ];
  const since = (each: ItemRecord) => entered.get(each.id) ?? each.createdAt;
  const before = (a: ItemRecord, b: ItemRecord) => {
    const [pa = 0, ra = 0] = key(a);
    const [pb = 0, rb = 0] = key(b);
    if (pa !== pb) return pa < pb;
    if (ra !== rb) return ra < rb;
    const [sa, sb] = [since(a), since(b)];
    return sa !== sb ? sa < sb : a.createdAt < b.createdAt;
  };
  const ahead = waiting
    .filter(({ item: other, board: each }) => takeable(each, other) && before(other, item))
    .map(({ item: other }) => other);
  const first = ahead.reduce<ItemRecord | undefined>(
    (best, other) => (best === undefined || before(other, best) ? other : best),
    undefined,
  );
  if (!first) return undefined;
  return { first: first.id, base: own.base, place: placeText(priority.get(first.id)) };
}

// Why a claim of the item is refused while another lands first, in one line.
export function landsFirstText(id: string, first: LandsFirst): string {
  const { base } = first;
  const ahead =
    'holder' in first
      ? `${first.holder} lands ${first.first} in ${base} now; ${id} lands after it`
      : `${first.first} lands in ${base} first (${first.place}), then ${id}`;
  return `${id} not claimed: ${ahead}: one agent lands at a time on ${base}, in the person's order, so no landing conflicts with another under way. Take other work meanwhile: otea next.`;
}

// What next says, with nothing to offer, of the items that wait for their turn to land.
export function landsFirstLine(id: string, first: LandsFirst): string {
  const { base } = first;
  const ahead =
    'holder' in first
      ? `${first.holder} lands ${first.first} there now`
      : `${first.first} lands there first (${first.place})`;
  return `${id} waits to land in ${base}: ${ahead}; one agent lands at a time on ${base}, in the person's order.`;
}
