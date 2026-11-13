import type { Channel } from '../core/authority.ts';
import { deliverables, isClosed, positionOf } from '../core/board/engine.ts';
import { stepById } from '../core/board/model.ts';
import {
  type ItemNote,
  NOTE_ANSWERED,
  NOTE_LEFT,
  type NoteAnchor,
  newNotesText,
  notesOf,
  repliedText,
  unansweredOf,
  waitNoteText,
} from '../core/board/notes.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  findEvidence,
  type ItemRecord,
  selectEvents,
  selectLeases,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { requireItem, systemClock } from './items.ts';
import { itemOnBoard, type LiveBoard, liveBoardOf, type Worker, workerOf } from './next.ts';

// Notes from the person while an agent does a step (core/board/notes.ts): the person leaves one
// (the page, the phone included) without moving the item; the agent answers it with otea reply,
// and hands off only once every note of the round is answered. Agents never open a thread: what
// they ask the person goes in a handoff, which changes the turn.

type Why = 'not_person' | 'not_agent' | 'empty' | 'not_working' | 'anchor';

function refuse(
  code: 'forbidden' | 'reason_required' | 'invalid_transition' | 'invalid_fields',
  id: string,
  why: Why,
  message: string,
): never {
  throw new OteaError(code, message, { kind: 'note', item: id, why });
}

export type LeaveNoteInput = {
  id: string;
  text: string;
  // A piece of evidence of this round of the item, by its id, and for a recording the moment seen.
  anchor?: { evidence: number; seconds?: number };
  actor: Actor;
  channel: Channel;
};

// The board and the step an agent is doing on the item, or the refusal of a note on it.
function workedOn(ctx: Context, item: ItemRecord): { board: LiveBoard; step: string } {
  const board = liveBoardOf(ctx, item.collection);
  const position = positionOf(item.state);
  const step =
    board && !isClosed(position) && position.phase === 'doing'
      ? stepById(board.def, position.step)
      : undefined;
  if (!board || !step || step.doer === 'you')
    refuse(
      'invalid_transition',
      item.id,
      'not_working',
      `No note left on ${item.id}: notes go to an agent while it does a step, and no agent is doing one on it`,
    );
  return { board, step: step.id };
}

function anchorFor(
  ctx: Context,
  item: ItemRecord,
  board: LiveBoard,
  roundStartedAt: string | undefined,
  given: NonNullable<LeaveNoteInput['anchor']>,
): NoteAnchor {
  const evidence = findEvidence(ctx.db, given.evidence);
  const seconds = given.seconds;
  const fits =
    evidence !== undefined &&
    evidence.itemId === item.id &&
    (roundStartedAt === undefined || evidence.createdAt >= roundStartedAt) &&
    (seconds === undefined || (Number.isFinite(seconds) && seconds >= 0));
  if (!fits)
    refuse(
      'invalid_fields',
      item.id,
      'anchor',
      `No note left on ${item.id}: evidence #${given.evidence} is not attached to it in this round`,
    );
  const part = evidence.module ?? undefined;
  const partName = part === undefined ? undefined : board.def.parts[part]?.name;
  return {
    evidence: evidence.id,
    filename: evidence.filename,
    ...(part === undefined ? {} : { part }),
    ...(partName === undefined ? {} : { partName }),
    ...(seconds === undefined ? {} : { seconds }),
  };
}

// The person leaves a note on an item an agent is doing: the step, its round and the lease stay as
// they are. The note keeps its moment: the step and round, how many of the step's required
// deliverables were in, the agent at work and the evidence it is on.
export function leaveNote(ctx: Context, input: LeaveNoteInput, now = systemClock): ItemNote {
  const { id } = input;
  if (input.actor.kind !== 'human')
    refuse(
      'forbidden',
      id,
      'not_person',
      `No note left on ${id}: only the person leaves notes. To ask the person something, hand it off with your question as its note.`,
    );
  const text = input.text.trim();
  if (text === '') refuse('reason_required', id, 'empty', `No note left on ${id}: it has no text`);
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, id);
    const at = now();
    const { board, step } = workedOn(ctx, item);
    const on = itemOnBoard(ctx, item, board.def);
    const anchor =
      input.anchor === undefined
        ? undefined
        : anchorFor(ctx, item, board, on.facts.roundStartedAt, input.anchor);
    const note = Math.max(0, ...on.thread.map(({ note: n }) => n)) + 1;
    const to = activeLease(item.lease, at)?.holder;
    appendEvent(ctx.db, {
      itemId: item.id,
      type: NOTE_LEFT,
      actor: input.actor,
      at,
      data: {
        note,
        text,
        step,
        stepName: stepById(board.def, step)?.name ?? step,
        round: on.round,
        delivered: deliverables(board.def, step, on.facts),
        ...(to === undefined ? {} : { to }),
        ...(anchor === undefined ? {} : { anchor }),
        channel: input.channel,
      },
    });
    const left = notesOf(selectEvents(ctx.db, item.id)).find((each) => each.note === note);
    if (!left) throw new Error(`note ${note} on ${item.id} was not kept`);
    return left;
  });
}

// The answer keeps the agent's name and, as every event does, the profile it declared.
export type ReplyNoteInput = {
  id: string;
  note: number;
  text: string;
  actor: Actor;
  channel: Channel;
};

export type ReplyNoteResult = { note: ItemNote; unanswered: number[]; text: string };

// The notes of the round a note was left in.
function roundOf(thread: readonly ItemNote[], note: ItemNote): ItemNote[] {
  return thread.filter(({ step, round }) => step === note.step && round === note.round);
}

// The agent answers a note: once, while no other agent holds the item. The answer says what of the
// round is still unanswered, or that the item may be handed off.
export function replyNote(ctx: Context, input: ReplyNoteInput, now = systemClock): ReplyNoteResult {
  const { id } = input;
  if (input.actor.kind !== 'agent')
    refuse('forbidden', id, 'not_agent', `Not answered: the agent answers the notes on ${id}`);
  return transaction(ctx.db, () => {
    const item = requireItem(ctx.db, id);
    const at = now();
    const left = notesOf(selectEvents(ctx.db, item.id)).find(({ note }) => note === input.note);
    if (!left) throw new OteaError('not_found', `${item.id} has no note ${input.note}`);
    if (left.answer)
      throw new OteaError(
        'invalid_transition',
        `Note ${input.note} on ${item.id} is already answered`,
      );
    assertMayWrite(item.id, activeLease(item.lease, at), input.actor);
    const text = input.text.trim();
    if (text === '')
      refuse('reason_required', id, 'empty', `Not answered: say your answer to note ${input.note}`);
    appendEvent(ctx.db, {
      itemId: item.id,
      type: NOTE_ANSWERED,
      actor: input.actor,
      at,
      data: { note: input.note, text, channel: input.channel },
    });
    const thread = notesOf(selectEvents(ctx.db, item.id));
    const note = thread.find((each) => each.note === input.note) ?? left;
    const unanswered = unansweredOf(roundOf(thread, note));
    return { note, unanswered, text: repliedText(item.id, input.note, unanswered) };
  });
}

// The notes still unanswered in the round of the step being done.
function waiting(ctx: Context, item: ItemRecord): ItemNote[] {
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return [];
  const on = itemOnBoard(ctx, item, board.def);
  if (isClosed(on.position) || on.position.phase !== 'doing') return [];
  return on.roundNotes.filter(({ answer }) => !answer);
}

// What a heartbeat or an attach adds while notes of the round wait for an answer: the text block
// and the notes; undefined when none waits.
export function agentNotes(
  ctx: Context,
  id: string,
): { text: string; notes: ItemNote[] } | undefined {
  const open = waiting(ctx, requireItem(ctx.db, id));
  if (open.length === 0) return undefined;
  return { text: newNotesText(id, open), notes: open };
}

export type NoteWaiting = { item: string; unanswered: number[]; notes: ItemNote[]; text: string };

// A note waiting for an answer from this agent: on an item it holds (its lease, even run out),
// while the step is being done. otea wait stops on it.
export function noteWaiting(ctx: Context, agent: string): NoteWaiting | undefined {
  for (const { id, lease } of selectLeases(ctx.db)) {
    if (lease.holder !== agent) continue;
    const open = waiting(ctx, requireItem(ctx.db, id));
    if (open.length === 0) continue;
    const unanswered = open.map(({ note }) => note);
    return { item: id, unanswered, notes: open, text: waitNoteText(id, unanswered) };
  }
  return undefined;
}

export type NotesFilter = { step?: string; round?: number };

export type NotesView = { item: string; notes: ItemNote[]; worker: Worker | null };

// The item's notes for the page: every round's, or those of a step (its name or id; the step it
// stands on when only a round is given) and round; with the agent at work and its last sign of life.
export function notesView(
  ctx: Context,
  id: string,
  filter: NotesFilter = {},
  now = systemClock,
): NotesView {
  const item = requireItem(ctx.db, id);
  const board = liveBoardOf(ctx, item.collection);
  if (!board) return { item: item.id, notes: [], worker: null };
  const on = itemOnBoard(ctx, item, board.def);
  const wanted = filter.step?.trim().toLocaleLowerCase();
  const current = isClosed(on.position) ? undefined : on.position.step;
  const notes = on.thread.filter((note) => {
    if (wanted !== undefined) {
      if (note.step !== filter.step && note.stepName.toLocaleLowerCase() !== wanted) return false;
    } else if (filter.round !== undefined && current !== undefined && note.step !== current)
      return false;
    return filter.round === undefined || note.round === filter.round;
  });
  return { item: item.id, notes, worker: workerOf(ctx, item, board.def, now()) ?? null };
}

// A list's mark for an item whose current round has notes: how many, how many wait for an answer,
// and the latest answer, so a page can say the agent replied without the turn changing.
export type NotesSummary = {
  count: number;
  unanswered: number;
  replied?: { note: number; by: string; at: string };
};

export function notesSummary(
  ctx: Context,
  item: ItemRecord,
  boards?: readonly LiveBoard[],
): NotesSummary | undefined {
  const board =
    boards === undefined
      ? liveBoardOf(ctx, item.collection)
      : boards.find(({ collection }) => collection === item.collection);
  if (!board) return undefined;
  const { roundNotes } = itemOnBoard(ctx, item, board.def);
  if (roundNotes.length === 0) return undefined;
  const latest = roundNotes
    .filter((note) => note.answer !== undefined)
    .sort((a, b) => (a.answer?.at ?? '').localeCompare(b.answer?.at ?? ''))
    .at(-1);
  return {
    count: roundNotes.length,
    unanswered: unansweredOf(roundNotes).length,
    ...(latest?.answer
      ? { replied: { note: latest.note, by: latest.answer.by, at: latest.answer.at } }
      : {}),
  };
}

// The notes of the round of the step the item stands on (show gives them as data).
export function roundNotesOf(ctx: Context, id: string): ItemNote[] {
  const item = requireItem(ctx.db, id);
  const board = liveBoardOf(ctx, item.collection);
  return board ? itemOnBoard(ctx, item, board.def).roundNotes : [];
}
