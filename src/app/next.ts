import type { Channel } from '../core/authority.ts';
import {
  approve,
  type GateAnswer,
  gateAt,
  handoff,
  handoffCheck,
  type ItemFacts,
  isClosed,
  type Linked,
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
import {
  type BoardDefinition,
  DONE,
  guardedBranch,
  isAgent,
  type Reviewer,
  SAME,
  type Step,
  stepById,
  type Target,
} from '../core/board/model.ts';
import { handedText, idleText, nextText, refusalText, wayByName } from '../core/board/next.ts';
import { evidenceByName, readFieldInput, stateByName, stateName } from '../core/board/reading.ts';
import { readDefinition } from '../core/board/schema.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import { closesOf } from '../core/workflow.ts';
import { findBoardOfCollection, findVersion, listBoards } from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import {
  type ItemRecord,
  selectEvents,
  selectEvidence,
  selectItems,
  selectRelationsOf,
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

// Moves the board made itself, not the work: a publish or a restore placing the item, and the
// reading of a preset collection as a board.
const BOARD_MOVES = new Set(['publish', 'restore', 'migrate']);

// A round's note as the history holds it: the step it was handed off from, how many moves came
// before it (its round is the step's round then), when and by whom.
type RawNote = { step: string; before: number; note: string; at: string; by: string };

function noteOf(data: Record<string, unknown>): string | undefined {
  return typeof data.note === 'string' && data.note.trim() !== '' ? data.note : undefined;
}

// The item's moves as the engine replays them. A collection read from a preset starts its history
// at that reading: the states before it belong to the preset's workflow, not to the board's steps.
// A reading that carries a note (Falta información read as Completar) starts that step's next
// round, with the person's question as its note.
function transitionsOf(
  ctx: Context,
  id: string,
): { initial?: string; createdAt?: string; moves: Transition[]; notes: RawNote[] } {
  const events = selectEvents(ctx.db, id);
  const created = events.find(({ type }) => type === 'created');
  const moved = events.filter(({ type }) => type === 'transitioned');
  const migrated = moved.findLastIndex(({ data }) => data.reason === 'migrate');
  const moves: Transition[] = [];
  const notes: RawNote[] = [];
  const reading = moved[migrated];
  const asked = reading ? noteOf(reading.data) : undefined;
  if (reading && asked !== undefined) {
    const to = positionOf(String(reading.data.to));
    if (!isClosed(to)) {
      moves.push({
        from: stateOf({ step: to.step, phase: 'review' }),
        to: to.step,
        at: reading.at,
      });
      const by = moved
        .slice(0, migrated)
        .findLast(({ data }) => String(data.to) === String(reading.data.from))?.actor.name;
      notes.push({
        step: to.step,
        before: 1,
        note: asked,
        at: reading.at,
        by: by ?? reading.actor.name,
      });
    }
  }
  for (const { data, at, actor } of moved.slice(migrated + 1)) {
    const note = noteOf(data);
    const from = positionOf(String(data.from));
    if (note !== undefined && !isClosed(from))
      notes.push({ step: from.step, before: moves.length, note, at, by: actor.name });
    moves.push({
      from: String(data.from),
      to: String(data.to),
      at,
      ...(BOARD_MOVES.has(String(data.reason)) ? { quiet: true } : {}),
    });
  }
  if (reading) return { initial: String(reading.data.to), createdAt: reading.at, moves, notes };
  const state = created?.data.state;
  return typeof state === 'string' ? { initial: state, moves, notes } : { moves, notes };
}

// The live board with this id, when it is published on a collection.
export function liveBoardById(ctx: Context, id: string): LiveBoard | undefined {
  const row = listBoards(ctx.db).find((board) => board.id === id);
  return row?.collection == null ? undefined : liveBoardOf(ctx, row.collection);
}

// The board an item's parts are on: the one its board divides into (itself for SAME).
export function partsBoardOf(ctx: Context, board: LiveBoard): LiveBoard | undefined {
  const split = board.def.split;
  if (!split) return undefined;
  return split.board === SAME ? board : liveBoardById(ctx, split.board);
}

// Another item as a wait reads it: its board and, while open, its step, by name.
function linkedOf(ctx: Context, id: string): Linked {
  const item = requireItem(ctx.db, id);
  const board = liveBoardOf(ctx, item.collection);
  if (!board) {
    const closed = closesOf(workflowOf(ctx, item), item.state) !== undefined;
    return { id, board: item.collection, ...(closed ? {} : { step: item.state }), closed };
  }
  const position = positionOf(item.state);
  if (isClosed(position)) return { id, board: board.def.name, closed: true };
  const step = stepById(board.def, position.step)?.name ?? position.step;
  return { id, board: board.def.name, step, closed: false };
}

export type Links = { parts: Linked[]; blockers: Linked[]; blocking: Linked[] };

// An item's parts (its children, on any board), what blocks it and what it blocks, oldest first.
export function linksOf(ctx: Context, id: string): Links {
  const relations = selectRelationsOf(ctx.db, id);
  const into = (kind: string) =>
    relations.filter((r) => r.kind === kind && r.to === id).map(({ from }) => linkedOf(ctx, from));
  return {
    parts: into('parent'),
    blockers: into('blocks'),
    blocking: relations
      .filter((r) => r.kind === 'blocks' && r.from === id)
      .map(({ to }) => linkedOf(ctx, to)),
  };
}

export type RoundNote = { step: string; round: number; note: string; at: string; by: string };

export type ItemOnBoard = {
  position: Position;
  facts: ItemFacts;
  rounds: Rounds;
  round: number;
  notes: RoundNote[];
  links: Links;
};

// The item as the engine reads it: its fields (title included), its evidence by part and when, the
// rounds of each step, read from its moves, its parts and what blocks it, and the note of each
// round handed off.
export function itemOnBoard(ctx: Context, item: ItemRecord, def: BoardDefinition): ItemOnBoard {
  const position = positionOf(item.state);
  const { initial, createdAt, moves, notes } = transitionsOf(ctx, item.id);
  const start = initial ?? def.steps[0]?.id ?? item.state;
  const since = createdAt ?? item.createdAt;
  const rounds = roundsOf(def, start, since, moves);
  const evidence = selectEvidence(ctx.db, item.id).flatMap((entry) =>
    entry.module === null ? [] : [{ part: entry.module, at: entry.createdAt }],
  );
  const step = isClosed(position) ? undefined : position.step;
  const startedAt = step === undefined ? undefined : rounds.startedAt[step];
  const links = linksOf(ctx, item.id);
  const facts: ItemFacts = {
    fields: { ...item.fields, title: item.title },
    evidence,
    ...(startedAt === undefined ? {} : { roundStartedAt: startedAt }),
    parts: links.parts,
    blockers: links.blockers,
  };
  const round = step === undefined ? 0 : (rounds.rounds[step] ?? 1);
  const said = notes.map(({ step: id, before, note, at, by }) => ({
    step: stepById(def, id)?.name ?? id,
    round: roundsOf(def, start, since, moves.slice(0, before)).rounds[id] ?? 1,
    note,
    at,
    by,
  }));
  return { position, facts, rounds, round, notes: said, links };
}

// What an item's page reads of it on a board (PLAN §9.1): its parts and the board they are on,
// what blocks it and what it blocks, each round's note, and, on a board that protects a branch,
// the branch and what its gates allow now.
export type BoardBlock = {
  parts: Linked[];
  partsBoard: string | null;
  blockers: Linked[];
  blocking: Linked[];
  notes: RoundNote[];
  gates: { push: GateAnswer; merge: GateAnswer } | null;
  branch: { value: string; repo?: string } | null;
};

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function boardBlockOf(ctx: Context, item: ItemRecord): BoardBlock | undefined {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return undefined;
  const on = itemOnBoard(ctx, item, board.def);
  const guarded = guardedBranch(board.def);
  const value = guarded ? item.fields[guarded.id] : undefined;
  const repo = guarded?.guard.repo === undefined ? undefined : item.fields[guarded.guard.repo];
  const gate = (action: 'push' | 'merge') => gateAt(board.def, on.position, action);
  return {
    parts: on.links.parts,
    partsBoard: partsBoardOf(ctx, board)?.def.name ?? null,
    blockers: on.links.blockers,
    blocking: on.links.blocking,
    notes: on.notes,
    gates: guarded ? { push: gate('push'), merge: gate('merge') } : null,
    branch: filled(value) ? { value, ...(filled(repo) ? { repo } : {}) } : null,
  };
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
  const board = liveBoardOf(ctx, item.collection);
  const child = board ? partsBoardOf(ctx, board) : undefined;
  return nextText(def, {
    id: item.id,
    title: item.title,
    position: on.position,
    round: on.round,
    fields: item.fields,
    evidence: counts,
    missing,
    parts: on.links.parts,
    blockers: on.links.blockers,
    ...(child === undefined ? {} : { child: child.def }),
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

// An agent's move along the compiled workflow is one of the engine's moves, checked as the engine
// checks it: from a doing phase, the handoff this agent would make (into its review, yours when
// the agent reviews the step itself, or along a way); from a review, an approval or a send-back
// by the step's reviewer. So otea move cannot walk around who may act.
function assertAgentMove(
  ctx: Context,
  board: LiveBoard,
  item: ItemRecord,
  to: string,
  actor: Actor,
) {
  const on = itemOnBoard(ctx, item, board.def);
  const target = positionOf(to);
  const position = on.position;
  if (isClosed(position)) return;
  if (position.phase === 'doing') {
    const way = isClosed(target)
      ? target.closed === DONE
        ? DONE
        : undefined
      : target.step === position.step
        ? undefined
        : target.step;
    const result = handoff(board.def, position, on.facts, {
      by: { kind: 'agent', name: actor.name },
      ...(way === undefined ? {} : { way }),
    });
    if (!result.ok) refuse(board.def, item, result);
    if (stateOf(result.to) === to) return;
    const step = stepById(board.def, position.step);
    const into = result.to;
    const name = step?.name ?? position.step;
    if (!isClosed(into) && into.phase === 'yours')
      throw new OteaError(
        'forbidden',
        `Not your move: your work on ${name} goes to the person's review, not yours; use otea handoff ${item.id}`,
      );
    throw new OteaError(
      'invalid_transition',
      `${item.id} cannot go to ${stateName(board.def, to)}: a handoff from ${name} goes to ${stateName(board.def, stateOf(into))}; use otea handoff ${item.id}`,
    );
  }
  assertReviewer(board.def, item, actor);
}

// A move along the compiled workflow that hands work off (into the step's review, or out of a
// step nobody reviews) passes the same check a handoff does, so otea move cannot walk around it.
export function assertMoveHandsOff(
  ctx: Context,
  item: ItemRecord,
  to: string,
  actor?: Actor,
): void {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return;
  if (actor?.kind === 'agent') {
    assertAgentMove(ctx, board, item, to, actor);
    return;
  }
  const from = positionOf(item.state);
  if (isClosed(from) || from.phase !== 'doing') return;
  const target = positionOf(to);
  const step = stepById(board.def, from.step);
  if (!step) return;
  const intoReview = !isClosed(target) && target.phase !== 'doing' && target.step === step.id;
  const along =
    step.reviewer === 'none' &&
    (isClosed(target) ? target.closed === DONE : target.step !== step.id);
  if (!intoReview && !along) return;
  const check = handoffCheck(board.def, step.id, itemOnBoard(ctx, item, board.def).facts);
  if (!check.ok) throw new OteaError('missing_fields', refusalText(item.id, check.missing));
}

// Fields a reader typed by name on a board (`--field Tamaño=Una`) as the item stores them; on a
// collection still on a preset, as given.
export function boardFieldInput<T extends Record<string, unknown>>(
  ctx: Context,
  collection: string,
  fields: T,
): T {
  const board = liveBoardOf(ctx, collection);
  if (!board || Object.keys(fields).length === 0) return fields;
  return readFieldInput(board.def, fields) as T;
}

// The state a reader names on a board (a step's name, `Done`), as the workflow's state.
export function boardState(ctx: Context, collection: string, to: string): string {
  const board = liveBoardOf(ctx, collection);
  return board ? stateByName(board.def, to) : to;
}

// The evidence part a reader names on a board (`--module Bocetos`), as its module id.
export function boardModule(ctx: Context, collection: string, module: string): string {
  const board = liveBoardOf(ctx, collection);
  return board ? evidenceByName(board.def, module) : module;
}

// An agent claims only what is its own on a board: a step it may take, or a review it does.
export function assertMayClaim(ctx: Context, item: ItemRecord, agent: string): void {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return;
  const position = positionOf(item.state);
  if (isClosed(position)) return;
  const step = stepById(board.def, position.step);
  if (!step) return;
  const name = (who: Reviewer | Step['doer']) =>
    who === 'you'
      ? 'the person'
      : who === 'any'
        ? 'any agent'
        : isAgent(who)
          ? who.agent
          : 'nobody';
  if (position.phase === 'doing') {
    if (mayTake(board.def, step.id, agent)) return;
    throw new OteaError(
      'not_claimable',
      `${item.id} is at ${step.name}, which ${name(step.doer)} does; claim only what is yours (otea next)`,
    );
  }
  if (position.phase === 'review' && isAgent(step.reviewer) && step.reviewer.agent === agent)
    return;
  const reviewer = position.phase === 'yours' ? 'you' : step.reviewer;
  throw new OteaError(
    'not_claimable',
    `${item.id} waits for ${name(reviewer)} to review ${step.name}; claim only what is yours (otea next)`,
  );
}
