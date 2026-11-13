import type { Channel } from '../core/authority.ts';
import {
  approve,
  type DropVia,
  drop,
  type GateAnswer,
  gateAt,
  handoff,
  handoffCheck,
  type ItemFacts,
  initialPosition,
  isClosed,
  type Linked,
  type Missing,
  type MoveResult,
  mayTake,
  type Position,
  positionOf,
  type Rounds,
  refusalCode,
  roundsOf,
  sendBack,
  sentBackAt,
  stateOf,
  type Transition,
  turnAt,
} from '../core/board/engine.ts';
import { requiredParent } from '../core/board/joins.ts';
import {
  type BoardDefinition,
  DONE,
  DROPPED,
  guardedBranch,
  isAgent,
  type Reviewer,
  SAME,
  type Step,
  stepById,
  stepIndex,
  type Target,
} from '../core/board/model.ts';
import {
  approvalRefusalText,
  createdText,
  droppedText,
  dropRefusalText,
  handedText,
  idleText,
  NOT_TAKEN_BACK,
  nextText,
  parentRequiredText,
  refusalText,
  type SentBack,
  takenBackText,
  wayByName,
} from '../core/board/next.ts';
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

// Every published board that is on a collection.
export function liveBoards(ctx: Context): LiveBoard[] {
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

// What a move said and who made it, by the move's index: a send-back's note is its reason (or the
// quote of a relayed one).
type Said = { by: Actor; text?: string };

function saidOf(data: Record<string, unknown>, by: Actor): Said {
  const text = [data.note, data.reason, data.quote].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  return text === undefined ? { by } : { by, text };
}

// The item's moves as the engine replays them. A collection read from a preset starts its history
// at that reading: the states before it belong to the preset's workflow, not to the board's steps.
// A reading that carries a note (Falta información read as Completar) starts that step's next
// round, with the person's question as its note.
function transitionsOf(
  ctx: Context,
  id: string,
): {
  initial?: string;
  createdAt?: string;
  moves: Transition[];
  notes: RawNote[];
  said: Said[];
} {
  const events = selectEvents(ctx.db, id);
  const created = events.find(({ type }) => type === 'created');
  const moved = events.filter(({ type }) => type === 'transitioned');
  const migrated = moved.findLastIndex(({ data }) => data.reason === 'migrate');
  const moves: Transition[] = [];
  const notes: RawNote[] = [];
  const said: Said[] = [];
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
      said.push(saidOf(reading.data, reading.actor));
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
    said.push(saidOf(data, actor));
  }
  if (reading)
    return { initial: String(reading.data.to), createdAt: reading.at, moves, notes, said };
  const state = created?.data.state;
  return typeof state === 'string'
    ? { initial: state, moves, notes, said }
    : { moves, notes, said };
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
  // While a step is being done, the send-back that started its round.
  sentBack?: SentBack;
};

// The send-back that started the round of the step being done, with its note, who sent it, when
// and the review it came from; undefined when the round began any other way.
function sentBackOf(
  def: BoardDefinition,
  position: Position,
  history: { start: string; since: string; moves: Transition[]; said: Said[] },
): SentBack | undefined {
  if (isClosed(position) || position.phase !== 'doing') return undefined;
  const index = sentBackAt(def, history.moves, position.step);
  const move = history.moves[index];
  const said = history.said[index];
  if (!move || !said) return undefined;
  const from = positionOf(move.from);
  if (isClosed(from)) return undefined;
  const rounds = roundsOf(def, history.start, history.since, history.moves.slice(0, index));
  return {
    note: said.text ?? '',
    by: { kind: said.by.kind, name: said.by.name },
    at: move.at,
    step: stepById(def, from.step)?.name ?? from.step,
    round: rounds.rounds[from.step] ?? 1,
  };
}

// The item as the engine reads it: its fields (title included), its evidence by part and when, the
// rounds of each step, read from its moves, its parts and what blocks it, the note of each round
// handed off, and the send-back its current round started with.
export function itemOnBoard(ctx: Context, item: ItemRecord, def: BoardDefinition): ItemOnBoard {
  const position = positionOf(item.state);
  const { initial, createdAt, moves, notes, said: words } = transitionsOf(ctx, item.id);
  const start = initial ?? def.steps[0]?.id ?? item.state;
  const since = createdAt ?? item.createdAt;
  const rounds = roundsOf(def, start, since, moves);
  const evidence = selectEvidence(ctx.db, item.id).flatMap((entry) =>
    entry.module === null ? [] : [{ part: entry.module, at: entry.createdAt }],
  );
  const step = isClosed(position) ? undefined : position.step;
  const startedAt = step === undefined ? undefined : rounds.startedAt[step];
  const links = linksOf(ctx, item.id);
  const sentBack = sentBackOf(def, position, { start, since, moves, said: words });
  const facts: ItemFacts = {
    fields: { ...item.fields, title: item.title },
    evidence,
    ...(startedAt === undefined ? {} : { roundStartedAt: startedAt }),
    ...(sentBack === undefined ? {} : { sentBack: true }),
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
  return {
    position,
    facts,
    rounds,
    round,
    notes: said,
    links,
    ...(sentBack === undefined ? {} : { sentBack }),
  };
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
  // While its step is being done: what the handoff still lacks, as the engine checks it.
  missing: Missing[];
  // While its step is being done after a send-back: the note it came back with, and from whom.
  sentBack?: SentBack;
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
    missing:
      isClosed(on.position) || on.position.phase !== 'doing'
        ? []
        : handoffCheck(board.def, on.position.step, on.facts).missing,
    ...(on.sentBack === undefined ? {} : { sentBack: on.sentBack }),
  };
}

// The round of the step an item is on, as the engine counts it (what `otea next` says); undefined
// off a board or once closed. `boards` lets a list read the live boards once.
export function boardRoundOf(
  ctx: Context,
  item: ItemRecord,
  boards: readonly LiveBoard[] = liveBoards(ctx),
): number | undefined {
  const board = boards.find(({ collection }) => collection === item.collection);
  if (!board || isClosed(positionOf(item.state))) return undefined;
  return itemOnBoard(ctx, item, board.def).round;
}

// `next`'s text for one item, as the agent `me` reads it; undefined off a board.
export function itemNextText(
  ctx: Context,
  item: ItemRecord,
  me?: string,
  now = systemClock,
): string | undefined {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return undefined;
  return textFor(ctx, item, board.def, now(), me);
}

// The agent the person left a stuck item for (Reasignar), while no agent has claimed or moved it
// since; undefined otherwise.
export function leftFor(ctx: Context, id: string): string | undefined {
  const last = selectEvents(ctx.db, id).findLast(({ type }) =>
    ['claimed', 'released', 'transitioned'].includes(type),
  );
  if (last?.type !== 'released' || last.actor.kind !== 'human') return undefined;
  const { cause, next } = last.data;
  return cause === 'reassign' && typeof next === 'string' ? next : undefined;
}

function textFor(
  ctx: Context,
  item: ItemRecord,
  def: BoardDefinition,
  at: string,
  me?: string,
): string {
  const on = itemOnBoard(ctx, item, def);
  const lease = activeLease(item.lease, at);
  const left = leftFor(ctx, item.id);
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
    ...(on.sentBack === undefined ? {} : { sentBack: on.sentBack }),
    ...(lease ? { holder: { name: lease.holder, expiresAt: lease.expiresAt } } : {}),
    ...(left === undefined ? {} : { leftFor: left }),
  });
}

// Whether the item is the agent's to take now: a doing phase it may take, or a review it is the
// reviewer of; never one another agent holds, nor one the person left for another agent.
function isTheirs(
  ctx: Context,
  def: BoardDefinition,
  item: ItemRecord,
  agent: string,
  at: string,
): boolean {
  const lease = activeLease(item.lease, at);
  if (lease && lease.holder !== agent) return false;
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase === 'yours') return false;
  const reviewer = stepById(def, position.step)?.reviewer;
  const mine =
    position.phase === 'doing'
      ? mayTake(def, position.step, agent)
      : reviewer !== undefined && isAgent(reviewer) && reviewer.agent === agent;
  if (!mine || lease) return mine;
  const left = leftFor(ctx, item.id);
  return left === undefined || left === agent;
}

// How many of the board's open items wait for the person.
export function waitingForYou(ctx: Context, board: LiveBoard): number {
  return selectItems(ctx.db, { collection: board.collection }).filter(
    ({ state }) => turnAt(board.def, positionOf(state)).who === 'you',
  ).length;
}

// `sentBack`: the note the item came back with, when a send-back started the round to do.
export type NextAnswer = {
  item: string | null;
  collection: string | null;
  text: string;
  sentBack?: SentBack;
};

// The item the agent should take, and its text: what was sent back to it first, then the oldest
// waiting; or, when there is none, each board's words for idle time and its cap on new items.
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
      .filter((item) => isTheirs(ctx, board.def, item, agent, at))
      .map((item) => ({
        item,
        board,
        returned: itemOnBoard(ctx, item, board.def).sentBack !== undefined,
      })),
  );
  candidates.sort(
    (a, b) =>
      Number(b.returned) - Number(a.returned) ||
      since(a.item).localeCompare(since(b.item)) ||
      a.item.createdAt.localeCompare(b.item.createdAt),
  );
  const first = candidates[0];
  if (first) {
    const sentBack = itemOnBoard(ctx, first.item, first.board.def).sentBack;
    return {
      item: first.item.id,
      collection: first.board.collection,
      text: textFor(ctx, first.item, first.board.def, at, agent),
      ...(sentBack === undefined ? {} : { sentBack }),
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
  // The way picked, by its name (`Animar`, `Done`, an earlier step to take it back to) or its id.
  way?: string;
  reason?: string;
  // The note of the handoff ("Nota de la entrega"), kept with the round.
  note?: string;
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
    const step = stepById(def, position.step)?.name ?? position.step;
    throw new OteaError('invalid_transition', `${id} has no way "${way}" from ${step}`, {
      kind: 'no_way',
      item: id,
      way,
      step,
    });
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
  if (result.code === 'missing') refuseHandoff(item.id, result.missing);
  if (result.code === 'reason_required')
    throw new OteaError('reason_required', NOT_TAKEN_BACK, {
      kind: 'way_back_reason',
      item: item.id,
    });
  if (result.code === 'bad_way')
    throw new OteaError('invalid_transition', `${item.id} cannot go that way from here`, {
      kind: 'no_way',
      item: item.id,
    });
  if (result.code === 'not_yours') {
    const position = positionOf(item.state);
    const step = isClosed(position) ? undefined : stepById(def, position.step);
    const agent = step && isAgent(step.doer) ? step.doer.agent : undefined;
    throw new OteaError(
      'forbidden',
      `Not your turn: ${agent ?? 'the person'} does ${step?.name ?? 'this step'} on ${item.id}`,
      {
        kind: 'not_your_turn',
        item: item.id,
        review: false,
        ...(step ? { step: step.name } : {}),
        ...(agent === undefined ? {} : { who: agent }),
      },
    );
  }
  throw new OteaError(
    'invalid_transition',
    `${item.id} ${PHASE_WORDS[result.code] ?? result.code}`,
    { kind: 'not_here', item: item.id, why: result.code },
  );
}

// A handoff that lacks what its step asks for, or whose waits do not hold.
function refuseHandoff(id: string, missing: Missing[]): never {
  throw new OteaError(refusalCode(missing), refusalText(id, missing), {
    kind: 'handoff',
    item: id,
    missing,
  });
}

// An approval whose waits no longer hold (a part reopened, a blocker added during the review).
function refuseApproval(item: ItemRecord, result: Exclude<MoveResult, { ok: true }>): never {
  if (result.code !== 'missing') throw new Error('not an approval refusal');
  throw new OteaError(refusalCode(result.missing), approvalRefusalText(item.id, result.missing), {
    kind: 'approval',
    item: item.id,
    missing: result.missing,
  });
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
  const agent = turn.who === 'agent' && turn.agent ? turn.agent : undefined;
  throw new OteaError(
    'forbidden',
    `Not your turn: ${agent ?? 'the person'} reviews ${step?.name ?? 'this step'} on ${item.id}`,
    {
      kind: 'not_your_turn',
      item: item.id,
      review: true,
      ...(step ? { step: step.name } : {}),
      ...(agent === undefined ? {} : { who: agent }),
    },
  );
}

function land(
  ctx: Context,
  item: ItemRecord,
  board: LiveBoard,
  to: Position,
  input: BoardMoveInput,
  at: string,
): Item {
  const lease = activeLease(item.lease, at);
  const data = {
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.note?.trim() ? { note: input.note } : {}),
    channel: input.channel,
  };
  return landMove(
    ctx.db,
    workflowOf(ctx, item),
    item,
    { to: stateOf(to), actor: input.actor, at, lease, board: true },
    data,
  );
}

// A handoff from the doing phase: refused, in the agent's words, while something required is
// missing (its parts, the note, what it waits for); otherwise to the review, or along the way
// picked. A way back to an earlier step takes only a reason, and starts that step's next round.
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
    // A step that asks for a note (or a round sent back) reads the reason when no note is given,
    // as a move does.
    const step = isClosed(on.position) ? undefined : stepById(board.def, on.position.step);
    const wanted = step?.note.req === 'always' || on.facts.sentBack === true;
    const asked = way === undefined && wanted && !input.note?.trim();
    const note = asked && input.reason?.trim() ? input.reason : input.note;
    const facts = note === undefined ? on.facts : { ...on.facts, note };
    const result = handoff(board.def, on.position, facts, {
      by,
      ...(way === undefined ? {} : { way }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    if (!result.ok) refuse(board.def, item, result);
    const moved = land(ctx, item, board, result.to, { ...input, ...(note ? { note } : {}) }, at);
    if (result.back && !isClosed(result.to)) {
      const round = itemOnBoard(ctx, requireItem(ctx.db, item.id), board.def).round;
      return { item: moved, text: takenBackText(board.def, item.id, result.to.step, round) };
    }
    return { item: moved, text: handedText(board.def, item.id, result.to) };
  });
}

// An approval from a review, along the way picked or the default; what the step waits for is
// checked again.
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
    const facts = itemOnBoard(ctx, item, board.def).facts;
    const result = approve(board.def, position, way, facts);
    if (!result.ok) {
      if (result.code === 'missing') refuseApproval(item, result);
      refuse(board.def, item, result);
    }
    const moved = land(ctx, item, board, result.to, input, at);
    return { item: moved, text: handedText(board.def, item.id, result.to) };
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
      { kind: 'send_back_reason', item: input.id },
    );
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, input.id);
    const board = requireBoard(ctx, item);
    const at = now();
    const position = positionOf(item.state);
    assertReviewer(board.def, item, input.actor);
    const result = sendBack(board.def, position);
    if (!result.ok) refuse(board.def, item, result);
    const moved = land(ctx, item, board, result.to, input, at);
    return { item: moved, text: handedText(board.def, item.id, result.to) };
  });
}

export type DropInput = {
  id: string;
  actor: Actor;
  channel: Channel;
  reason?: string;
  // One of the board's motives, by its name (any case) or its id.
  motive?: string;
  // Who asks: the person on the page, the person through an agent (a relay), or an agent on its
  // own. Read from the actor when left out.
  via?: DropVia;
};

const DROP_CODES = {
  not_open: 'item_closed',
  reason_required: 'reason_required',
  motive_required: 'reason_required',
  not_droppable: 'forbidden',
  not_relayable: 'not_relayable',
} as const;

// The motive a reader names (`--motive "Duplicado"`, or its id); undefined when it names none.
export function motiveByName(def: BoardDefinition, name?: string): string | undefined {
  if (name === undefined) return undefined;
  const wanted = name.trim().toLocaleLowerCase();
  return def.drop.motives.find(
    ({ id, name: said }) => id === name.trim() || said.trim().toLocaleLowerCase() === wanted,
  )?.id;
}

function dropTarget(board: LiveBoard, item: ItemRecord, input: Omit<DropInput, 'id'>): Position {
  const via: DropVia = input.via ?? (input.actor.kind === 'agent' ? 'agent' : 'page');
  const motive = motiveByName(board.def, input.motive);
  const result = drop(board.def, positionOf(item.state), {
    by: { kind: input.actor.kind, name: input.actor.name },
    via,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(motive === undefined ? {} : { motive }),
  });
  if (!result.ok)
    throw new OteaError(DROP_CODES[result.code], dropRefusalText(board.def, item.id, result.code), {
      kind: 'drop',
      item: item.id,
      board: board.def.name,
      why: result.code,
      motives: board.def.drop.motives.map(({ name }) => name),
    });
  return result.to;
}

// A discard (otea drop): always with a reason, with one of the board's motives when it has any; an
// agent drops only while doing a step that lets it, a relay only where the person may discard
// through an agent.
export function dropItem(ctx: Context, input: DropInput, now = systemClock): BoardMoveResult {
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, input.id);
    const board = requireBoard(ctx, item);
    const at = now();
    if (input.actor.kind === 'agent' && input.via !== 'relay')
      assertMayWrite(item.id, activeLease(item.lease, at), input.actor);
    const to = dropTarget(board, item, input);
    const moved = land(ctx, item, board, to, input, at);
    return { item: moved, text: droppedText(board.def, item.id, to) };
  });
}

// Whether a move into `target` from a review approves it: on to a later step or to Hecho.
function approves(def: BoardDefinition, from: Position, target: Position): boolean {
  if (isClosed(from) || from.phase === 'doing') return false;
  if (isClosed(target)) return target.closed === DONE;
  return target.phase === 'doing' && stepIndex(def, target.step) > stepIndex(def, from.step);
}

// A move's reason and note, and, for the person's discard, whether it came from the page or
// through an agent (a relay).
type MoveWords = { reason?: string; note?: string; via?: 'page' | 'relay' };

// An agent's move along the compiled workflow is one of the engine's moves, checked as the engine
// checks it: from a doing phase, the handoff this agent would make (into its review, yours when
// the agent reviews the step itself, along a way, or back to an earlier step) or its own drop;
// from a review, an approval or a send-back by the step's reviewer. So otea move cannot walk
// around who may act.
function assertAgentMove(
  ctx: Context,
  board: LiveBoard,
  item: ItemRecord,
  to: string,
  actor: Actor,
  words: MoveWords,
) {
  const on = itemOnBoard(ctx, item, board.def);
  const target = positionOf(to);
  const position = on.position;
  if (isClosed(position)) return;
  if (isClosed(target) && target.closed === DROPPED) {
    const motive = (target as { motive?: string }).motive;
    dropTarget(board, item, {
      actor,
      channel: 'cli',
      ...(words.reason === undefined ? {} : { reason: words.reason }),
      ...(motive === undefined ? {} : { motive }),
    });
    return;
  }
  if (position.phase === 'doing') {
    const way = isClosed(target)
      ? target.closed === DONE
        ? DONE
        : undefined
      : target.step === position.step
        ? undefined
        : target.step;
    const note = words.note ?? words.reason;
    const result = handoff(
      board.def,
      position,
      note === undefined ? on.facts : { ...on.facts, note },
      {
        by: { kind: 'agent', name: actor.name },
        ...(way === undefined ? {} : { way }),
        ...(words.reason === undefined ? {} : { reason: words.reason }),
      },
    );
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
  if (approves(board.def, position, target)) {
    const result = approve(board.def, position, undefined, on.facts);
    if (!result.ok && result.code === 'missing') refuseApproval(item, result);
  }
}

// A move along the compiled workflow is checked as the engine checks it, whoever makes it: a
// handoff (into the step's review, or out of a step nobody reviews) needs what the step asks, its
// note included (the move's note, or its reason), and what it waits for; an approval re-checks the
// waits; a discard goes through drop(). Returns the note the move carries, to keep with its round.
export function assertMoveHandsOff(
  ctx: Context,
  item: ItemRecord,
  to: string,
  actor?: Actor,
  words: MoveWords = {},
): string | undefined {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return undefined;
  const from = positionOf(item.state);
  const step = isClosed(from) ? undefined : stepById(board.def, from.step);
  const sentBack = itemOnBoard(ctx, item, board.def).sentBack !== undefined;
  const note = noteFor(board.def, step, from, positionOf(to), words, sentBack);
  if (actor?.kind === 'agent') {
    assertAgentMove(ctx, board, item, to, actor, words);
    return note;
  }
  const target = positionOf(to);
  if (isClosed(from) || !step) return note;
  if (isClosed(target) && target.closed === DROPPED) {
    const motive = (target as { motive?: string }).motive;
    dropTarget(board, item, {
      actor: actor ?? { kind: 'human', name: 'you' },
      channel: 'ui',
      via: words.via ?? 'page',
      ...(words.reason === undefined ? {} : { reason: words.reason }),
      ...(motive === undefined ? {} : { motive }),
    });
    return note;
  }
  const on = itemOnBoard(ctx, item, board.def);
  if (from.phase !== 'doing') {
    if (!approves(board.def, from, target)) return note;
    const result = approve(board.def, from, undefined, on.facts);
    if (!result.ok && result.code === 'missing') refuseApproval(item, result);
    return note;
  }
  const intoReview = !isClosed(target) && target.phase !== 'doing' && target.step === step.id;
  const along =
    step.reviewer === 'none' &&
    (isClosed(target)
      ? target.closed === DONE
      : stepIndex(board.def, target.step) > stepIndex(board.def, step.id));
  if (!intoReview && !along) return note;
  const facts = note === undefined ? on.facts : { ...on.facts, note };
  const check = handoffCheck(board.def, step.id, facts);
  if (!check.ok) refuseHandoff(item.id, check.missing);
  return note;
}

// The note a move hands off with: the one given, or, on a step that asks for a note (or a round
// sent back), its reason; none for a discard or a way back (their reason is theirs).
function noteFor(
  def: BoardDefinition,
  step: Step | undefined,
  from: Position,
  to: Position,
  words: MoveWords,
  sentBack: boolean,
): string | undefined {
  if (!step || isClosed(from) || from.phase !== 'doing') return undefined;
  if (isClosed(to) ? to.closed !== DONE : stepIndex(def, to.step) < stepIndex(def, step.id))
    return undefined;
  if (words.note?.trim()) return words.note;
  if (step.note.req !== 'always' && !sentBack) return undefined;
  return words.reason?.trim() ? words.reason : undefined;
}

// An item of a board that is always part of another's is refused without a parent.
export function assertMayStandAlone(ctx: Context, collection: string, parent?: string): void {
  const board = liveBoardOf(ctx, collection);
  if (!board || parent !== undefined) return;
  const owner = requiredParent(liveBoards(ctx), board.id);
  if (owner)
    throw new OteaError('parent_required', parentRequiredText(board.def, owner.def), {
      kind: 'parent_required',
      item: board.def.item,
      parent: owner.def.item,
    });
}

// Where a new item starts on the board a collection is on (undefined off a board): the first
// step, or the next one when the first is skipped for an item created with everything it asks.
export function boardStart(
  ctx: Context,
  collection: string,
  fields: Readonly<Record<string, unknown>>,
): string | undefined {
  const board = liveBoardOf(ctx, collection);
  if (!board) return undefined;
  return stateOf(initialPosition(board.def, { fields, evidence: [] }).position);
}

// What otea create says of a new item on a board: where it starts, and why when its first step was
// skipped or still lacks what it asks for.
export function createdTextOf(ctx: Context, item: ItemRecord): string | undefined {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return undefined;
  const on = itemOnBoard(ctx, item, board.def);
  const missing = isClosed(on.position)
    ? []
    : handoffCheck(board.def, on.position.step, on.facts).missing;
  return createdText(board.def, item.id, on.position, missing);
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

// An agent cannot move the protected branch (or the repository it is read from) away from the
// gate: once the branch is set, it changes only while a step that pushes it is being done, never in
// its review or at a step that does not push it, where pushes and merges stay refused.
export function assertBranchMayChange(
  ctx: Context,
  item: { id: string; collection: string; state: string; fields: Record<string, unknown> },
  changes: Readonly<Record<string, unknown>>,
  actor: Actor,
): void {
  if (actor.kind !== 'agent') return;
  const board = liveBoardOf(ctx, item.collection);
  const branch = board ? guardedBranch(board.def) : undefined;
  if (!board || !branch) return;
  const position = positionOf(item.state);
  if (gateAt(board.def, position, 'push').allowed) return;
  const keys = [branch.id, ...(branch.guard.repo === undefined ? [] : [branch.guard.repo])];
  const moved = keys.filter((key) => {
    const was = item.fields[key];
    return key in changes && was !== undefined && was !== '' && changes[key] !== was;
  });
  const first = moved[0];
  if (first === undefined) return;
  const name = board.def.parts[first]?.name ?? first;
  const pushers = branch.guard.push.map((id) => stepById(board.def, id)?.name ?? id).join(', ');
  throw new OteaError(
    'forbidden',
    `Not updated ${item.id}: its ${name} is frozen here; it can change only while ${pushers} is being done.`,
    {
      kind: 'frozen',
      item: item.id,
      part: name,
      steps: branch.guard.push.map((id) => stepById(board.def, id)?.name ?? id),
    },
  );
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
