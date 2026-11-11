import {
  approve,
  handoff,
  handoffCheck,
  type ItemFacts,
  isClosed,
  type MoveResult,
  mayTake,
  type Position,
  positionOf,
  type Rounds,
  roundsOf,
  sendBack,
  stateOf,
  type Transition,
  turnAt,
} from '../core/board/engine.ts';
import { handedText, idleText, nextText, refusalText, wayByName } from '../core/board/next.ts';
import { type BoardDefinition, isAgent, stepById, type Target } from '../core/board/model.ts';
import { readDefinition } from '../core/board/schema.ts';
import type { Channel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import { findBoardOfCollection, findVersion, listBoards } from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import {
  type ItemRecord,
  selectEvents,
  selectEvidence,
  selectItems,
  selectStateEntries,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Item, landMove, requireItem, systemClock, workflowOf } from './items.ts';

// What agents meet on a published board: the facts the step engine reads of an item, `next` (the
// item to take and its text) and the three moves an agent makes on a board (handoff, approve and
// send-back), each checked by the engine and worded by the one agent text writer
// (core/board/next.ts), so the CLI, MCP and Studio's preview say the same words.

export type LiveBoard = { id: string; version: number; collection: string; def: BoardDefinition };

// The live version of the board a collection is on; undefined for a collection still on a preset.
export function liveBoardOf(ctx: Context, collection: string): LiveBoard | undefined {
  const row = findBoardOfCollection(ctx.db, collection);
  if (!row || row.liveVersion === null) return undefined;
  const version = findVersion(ctx.db, row.id, row.liveVersion);
  if (!version) return undefined;
  return {
    id: row.id,
    version: row.liveVersion,
    collection,
    def: readDefinition(version.definition),
  };
}

function liveBoards(ctx: Context): LiveBoard[] {
  return listBoards(ctx.db).flatMap((row) =>
    row.collection === null ? [] : (liveBoardOf(ctx, row.collection) ?? []),
  );
}

function transitionsOf(ctx: Context, id: string): { initial?: string; moves: Transition[] } {
  const events = selectEvents(ctx.db, id);
  const created = events.find(({ type }) => type === 'created');
  const moves = events
    .filter(({ type }) => type === 'transitioned')
    .map(({ data, at }) => ({ from: String(data.from), to: String(data.to), at }));
  const state = created?.data.state;
  return typeof state === 'string' ? { initial: state, moves } : { moves };
}

export type ItemOnBoard = { position: Position; facts: ItemFacts; rounds: Rounds; round: number };

// The item as the engine reads it: its fields (title included), its evidence by part and when, and
// the rounds of each step, read from its moves.
export function itemOnBoard(ctx: Context, item: ItemRecord, def: BoardDefinition): ItemOnBoard {
  const position = positionOf(item.state);
  const { initial, moves } = transitionsOf(ctx, item.id);
  const first = def.steps[0]?.id ?? item.state;
  const rounds = roundsOf(def, initial ?? first, item.createdAt, moves);
  const evidence = selectEvidence(ctx.db, item.id).flatMap((entry) =>
    entry.module === null ? [] : [{ part: entry.module, at: entry.createdAt }],
  );
  const step = isClosed(position) ? undefined : position.step;
  const startedAt = step === undefined ? undefined : rounds.startedAt[step];
  const facts: ItemFacts = {
    fields: { ...item.fields, title: item.title },
    evidence,
    ...(startedAt === undefined ? {} : { roundStartedAt: startedAt }),
  };
  const round = step === undefined ? 0 : (rounds.rounds[step] ?? 1);
  return { position, facts, rounds, round };
}

// `next`'s text for one item, as the agent `me` reads it; undefined off a board.
export function itemNextText(ctx: Context, item: ItemRecord, me?: string): string | undefined {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return undefined;
  return textFor(ctx, item, board.def, me);
}

function textFor(ctx: Context, item: ItemRecord, def: BoardDefinition, me?: string): string {
  const on = itemOnBoard(ctx, item, def);
  const counts: Record<string, number> = {};
  for (const { part } of on.facts.evidence) counts[part] = (counts[part] ?? 0) + 1;
  const missing = isClosed(on.position)
    ? []
    : handoffCheck(def, on.position.step, on.facts).missing;
  return nextText(def, {
    id: item.id,
    title: item.title,
    position: on.position,
    round: on.round,
    fields: item.fields,
    evidence: counts,
    missing,
    ...(me === undefined ? {} : { me }),
  });
}

// Whether the item is the agent's to take now: a doing phase it may take, or a review it is the
// reviewer of; never one another agent holds.
function isTheirs(def: BoardDefinition, item: ItemRecord, agent: string, at: string): boolean {
  const lease = activeLease(item.lease, at);
  if (lease && lease.holder !== agent) return false;
  const position = positionOf(item.state);
  if (isClosed(position)) return false;
  if (position.phase === 'doing') return mayTake(def, position.step, agent);
  if (position.phase === 'yours') return false;
  const reviewer = stepById(def, position.step)?.reviewer;
  return reviewer !== undefined && isAgent(reviewer) && reviewer.agent === agent;
}

// How many of the board's open items wait for the person.
export function waitingForYou(ctx: Context, board: LiveBoard): number {
  return selectItems(ctx.db, { collection: board.collection }).filter(
    ({ state }) => turnAt(board.def, positionOf(state)).who === 'you',
  ).length;
}

export type NextAnswer = { item: string | null; collection: string | null; text: string };

// The item the agent should take, oldest waiting first, and its text; or, when there is none, each
// board's words for idle time and its cap on new items.
export function nextFor(
  ctx: Context,
  agent: string,
  options: { collection?: string } = {},
  now = systemClock,
): NextAnswer {
  const boards = liveBoards(ctx).filter(
    (board) => options.collection === undefined || board.collection === options.collection,
  );
  if (options.collection !== undefined && boards.length === 0) {
    throw new OteaError(
      'not_found',
      `There is no published board on collection "${options.collection}"`,
    );
  }
  const at = now();
  const entered = selectStateEntries(ctx.db);
  const since = (item: ItemRecord) => entered.get(item.id) ?? item.createdAt;
  const candidates = boards.flatMap((board) =>
    selectItems(ctx.db, { collection: board.collection })
      .filter((item) => isTheirs(board.def, item, agent, at))
      .map((item) => ({ item, board })),
  );
  candidates.sort(
    (a, b) =>
      since(a.item).localeCompare(since(b.item)) ||
      a.item.createdAt.localeCompare(b.item.createdAt),
  );
  const first = candidates[0];
  if (first) {
    return {
      item: first.item.id,
      collection: first.board.collection,
      text: textFor(ctx, first.item, first.board.def, agent),
    };
  }
  return {
    item: null,
    collection: options.collection ?? null,
    text: boards.map((board) => idleText(board.def, waitingForYou(ctx, board))).join('\n\n'),
  };
}

export type BoardMoveInput = {
  id: string;
  actor: Actor;
  channel: Channel;
  // The way picked, by its name (`Animar`, `Done`) or its step id.
  way?: string;
  reason?: string;
};

export type BoardMoveResult = { item: Item; text: string };

function requireBoard(ctx: Context, item: ItemRecord): LiveBoard {
  const board = liveBoardOf(ctx, item.collection);
  if (!board)
    throw new OteaError(
      'invalid_transition',
      `${item.id} is on collection "${item.collection}", which is not a published board; use otea move`,
    );
  return board;
}

function wayOf(
  def: BoardDefinition,
  position: Position,
  id: string,
  way?: string,
): Target | undefined {
  if (way === undefined || isClosed(position)) return undefined;
  const target = wayByName(def, position.step, way);
  if (target === undefined) {
    throw new OteaError(
      'invalid_transition',
      `${id} has no way "${way}" from ${stepById(def, position.step)?.name ?? position.step}`,
    );
  }
  return target;
}

const PHASE_WORDS: Readonly<Record<string, string>> = {
  not_doing: 'is not being worked on: it waits for a review or is closed',
  not_review: 'is not waiting for a review',
  unknown_step: 'stands in a step the board no longer has',
};

function refuse(
  def: BoardDefinition,
  item: ItemRecord,
  result: Exclude<MoveResult, { ok: true }>,
): never {
  if (result.code === 'missing')
    throw new OteaError('missing_fields', refusalText(item.id, result.missing));
  if (result.code === 'bad_way')
    throw new OteaError('invalid_transition', `${item.id} cannot go that way from here`);
  if (result.code === 'not_yours') {
    const position = positionOf(item.state);
    const step = isClosed(position) ? undefined : stepById(def, position.step);
    const who = step && isAgent(step.doer) ? step.doer.agent : 'the person';
    throw new OteaError(
      'forbidden',
      `Not your turn: ${who} does ${step?.name ?? 'this step'} on ${item.id}`,
    );
  }
  throw new OteaError(
    'invalid_transition',
    `${item.id} ${PHASE_WORDS[result.code] ?? result.code}`,
  );
}

// Whether the performer reviews the item now: the step's agent reviewer, or the person for their
// own reviews (an agent relays those with otea relay, never approves them).
function assertReviewer(def: BoardDefinition, item: ItemRecord, actor: Actor): void {
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase === 'doing') return;
  const turn = turnAt(def, position);
  if (actor.kind === 'human') return;
  if (turn.who === 'agent' && (turn.agent === undefined || turn.agent === actor.name)) return;
  const step = stepById(def, position.step);
  const who = turn.who === 'agent' && turn.agent ? turn.agent : 'the person';
  throw new OteaError(
    'forbidden',
    `Not your turn: ${who} reviews ${step?.name ?? 'this step'} on ${item.id}`,
  );
}

function land(
  ctx: Context,
  item: ItemRecord,
  board: LiveBoard,
  to: Position,
  input: BoardMoveInput,
  at: string,
): BoardMoveResult {
  const lease = activeLease(item.lease, at);
  const data = {
    ...(input.reason ? { reason: input.reason } : {}),
    channel: input.channel,
  };
  const moved = landMove(
    ctx.db,
    workflowOf(ctx, item),
    item,
    { to: stateOf(to), actor: input.actor, at, lease },
    data,
  );
  return { item: moved, text: handedText(board.def, item.id, to) };
}

// A handoff from the doing phase: refused, in the agent's words, while something required is
// missing; otherwise to the review, or along the way picked.
export function handoffItem(
  ctx: Context,
  input: BoardMoveInput,
  now = systemClock,
): BoardMoveResult {
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, input.id);
    const board = requireBoard(ctx, item);
    const at = now();
    assertMayWrite(item.id, activeLease(item.lease, at), input.actor);
    const on = itemOnBoard(ctx, item, board.def);
    const way = wayOf(board.def, on.position, item.id, input.way);
    const by = { kind: input.actor.kind, name: input.actor.name };
    const result = handoff(board.def, on.position, on.facts, {
      by,
      ...(way === undefined ? {} : { way }),
    });
    if (!result.ok) refuse(board.def, item, result);
    return land(ctx, item, board, result.to, input, at);
  });
}

// An approval from a review, along the way picked or the default.
export function approveItem(
  ctx: Context,
  input: BoardMoveInput,
  now = systemClock,
): BoardMoveResult {
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, input.id);
    const board = requireBoard(ctx, item);
    const at = now();
    const position = positionOf(item.state);
    assertReviewer(board.def, item, input.actor);
    const way = wayOf(board.def, position, item.id, input.way);
    const result = approve(board.def, position, way);
    if (!result.ok) refuse(board.def, item, result);
    return land(ctx, item, board, result.to, input, at);
  });
}

// A send-back from a review (the person's Devolver, an agent reviewer's Pedir otra ronda): the item
// goes back to the step's `back` for its next round, with why.
export function sendBackItem(
  ctx: Context,
  input: BoardMoveInput,
  now = systemClock,
): BoardMoveResult {
  if (!input.reason?.trim())
    throw new OteaError(
      'reason_required',
      `Sending ${input.id} back needs a reason: what to change`,
    );
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, input.id);
    const board = requireBoard(ctx, item);
    const at = now();
    const position = positionOf(item.state);
    assertReviewer(board.def, item, input.actor);
    const result = sendBack(board.def, position);
    if (!result.ok) refuse(board.def, item, result);
    return land(ctx, item, board, result.to, input, at);
  });
}
