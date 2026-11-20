import type { Channel } from '../core/authority.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { stepById } from '../core/board/model.ts';
import { NOTE_LEFT } from '../core/board/notes.ts';
import {
  askedText,
  chatAnswerText,
  type ItemQuestion,
  QUESTION_ANSWERED,
  QUESTION_ASKED,
  questionsOf,
  waitAnswerText,
} from '../core/board/questions.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type ItemRecord,
  selectEvents,
  selectEventsOfTypes,
  selectRelationsOf,
  selectStateEntries,
} from '../store/queries.ts';
import { askingItems } from './asking.ts';
import type { Context } from './context.ts';
import { requireItem, requireWritableItem, systemClock } from './items.ts';
import { assertMayWriteItem, takeItem } from './lease-take.ts';
import { itemOnBoard, type LiveBoard, liveBoardOf } from './next.ts';
import { sessionEnded } from './presence.ts';
import { RELAYED_HUMAN } from './relay.ts';
import { liftSetAside, SET_ASIDE_LIFTED } from './set-aside.ts';

// An agent's question to the person (core/board/questions.ts): the agent asks while it does a step,
// and the turn is the person's until they answer; the answer hands it back to the agent in the same
// round. Neither moves the item. The person's notes (notes.ts) are another thread, which changes
// no turn: an agent's doubts go here.

type Why = 'not_agent' | 'not_person' | 'empty' | 'not_working' | 'asking' | 'none_open';

function refuse(
  code: 'forbidden' | 'reason_required' | 'invalid_transition',
  id: string,
  why: Why,
  message: string,
): never {
  throw new OteaError(code, message, { kind: 'question', item: id, why });
}

export type AskInput = { id: string; text: string; actor: Actor; channel: Channel };

export type AskResult = { question: ItemQuestion; text: string };

// The board and the step an agent is doing on the item, or the refusal of a question on it.
function doing(ctx: Context, item: ItemRecord): { board: LiveBoard; step: string } {
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
      `Not asked on ${item.id}: ask only while you do a step on a board`,
    );
  return { board, step: step.id };
}

// The agent doing the item's step asks the person: one question at a time, while no other agent
// holds the item. The question keeps the step and round it was asked in.
export function askQuestion(ctx: Context, input: AskInput, now = systemClock): AskResult {
  const { id } = input;
  if (input.actor.kind !== 'agent')
    refuse('forbidden', id, 'not_agent', `Not asked: only an agent asks the person on ${id}`);
  const text = input.text.trim();
  if (text === '') refuse('reason_required', id, 'empty', `Not asked on ${id}: say your question`);
  return transaction(ctx.db, () => {
    const item = requireWritableItem(ctx.db, id);
    const at = now();
    assertMayWriteItem(ctx.db, item, input.actor, at);
    const { board, step } = doing(ctx, item);
    const on = itemOnBoard(ctx, item, board.def);
    if (on.asking)
      refuse(
        'invalid_transition',
        item.id,
        'asking',
        `Not asked on ${item.id}: a question already waits for the person ("${on.asking.text}")`,
      );
    const question = Math.max(0, ...on.questions.map(({ question: n }) => n)) + 1;
    appendEvent(ctx.db, {
      itemId: item.id,
      type: QUESTION_ASKED,
      actor: input.actor,
      at,
      data: {
        question,
        text,
        step,
        stepName: stepById(board.def, step)?.name ?? step,
        round: on.round,
        channel: input.channel,
      },
    });
    const asked = questionsOf(selectEvents(ctx.db, item.id)).find(
      (each) => each.question === question,
    );
    if (!asked) throw new Error(`question ${question} on ${item.id} was not kept`);
    return { question: asked, text: askedText(item.id) };
  });
}

export type AnswerInput = { id: string; text: string; actor: Actor; channel: Channel };

// The person answers the question that waits: the turn goes back to the agent, in the same round.
export function answerQuestion(ctx: Context, input: AnswerInput, now = systemClock): ItemQuestion {
  const { id } = input;
  if (input.actor.kind !== 'human')
    refuse('forbidden', id, 'not_person', `Not answered: the person answers questions on ${id}`);
  const text = input.text.trim();
  if (text === '') refuse('reason_required', id, 'empty', `Not answered on ${id}: say your answer`);
  return recordAnswer(ctx, { ...input, text }, {}, now).question;
}

export type ChatAnswerResult = { question: ItemQuestion; text: string };

// The answer the person gave in the chat instead of in Otea, put on the question by an agent (otea
// answer, P4-R2-2): it is the person's, as a relayed decision is, marked as noted by that agent,
// and hands the turn back as an answer given in Otea does.
export function noteChatAnswer(
  ctx: Context,
  input: AnswerInput,
  now = systemClock,
): ChatAnswerResult {
  const { id, actor } = input;
  if (actor.kind !== 'agent')
    refuse(
      'forbidden',
      id,
      'not_agent',
      `Not noted: the person answers on the item page; an agent notes an answer they gave in the chat`,
    );
  const text = input.text.trim();
  if (text === '')
    refuse('reason_required', id, 'empty', `Not noted on ${id}: give the person's words`);
  const data = { via: actor.name, source: 'conversation' };
  const { question, gone } = recordAnswer(ctx, { ...input, text, actor: RELAYED_HUMAN }, data, now);
  const asker = question.by === actor.name ? undefined : { name: question.by, gone };
  return { question, text: chatAnswerText(id, asker) };
}

// The question answered, and whether the session of the agent that asked it ended (`gone`).
function recordAnswer(
  ctx: Context,
  input: AnswerInput,
  extra: Record<string, string>,
  now: () => string,
): { question: ItemQuestion; gone: boolean } {
  const { id, text } = input;
  return transaction(ctx.db, () => {
    const item = requireWritableItem(ctx.db, id);
    const board = liveBoardOf(ctx, item.collection);
    const open = board ? itemOnBoard(ctx, item, board.def).asking : undefined;
    if (!open)
      refuse(
        'invalid_transition',
        item.id,
        'none_open',
        `${item.id}: no question waits for ${extra.via ? 'the person' : 'you'}`,
      );
    appendEvent(ctx.db, {
      itemId: item.id,
      type: QUESTION_ANSWERED,
      actor: input.actor,
      at: now(),
      data: { question: open.question, text, channel: input.channel, ...extra },
    });
    const answered = questionsOf(selectEvents(ctx.db, item.id)).find(
      (each) => each.question === open.question,
    );
    if (!answered) throw new Error(`question ${open.question} on ${item.id} was not kept`);
    // The person's answer takes up an item set aside for later (P7-R3-1).
    const cause = 'answer' as const;
    liftSetAside(ctx.db, { id: item.id, actor: input.actor, at: now(), cause }, extra);
    // The answer goes back to the agent that asked: its lease, run out while the person thought,
    // is taken again for it, unless another agent holds the item now, or its session ended: then
    // the item waits for whichever agent claims it (P3C-R3-11).
    const at = now();
    const lease = activeLease(item.lease, at);
    const gone = sessionEnded(ctx.db, open.by, () => at);
    if (!lease && !gone) takeItem(ctx.db, item, { kind: 'agent', name: open.by }, at);
    return { question: answered, gone };
  });
}

export type AnswerWaiting = { item: string; question: number; text: string };

// An answer this agent has not acted on yet: to a question it asked in the round of the step still
// being done, with nothing done by it on the item since. otea wait stops on it.
export function answerWaiting(ctx: Context, agent: string): AnswerWaiting | undefined {
  const asked = new Set(
    selectEventsOfTypes(ctx.db, [QUESTION_ASKED])
      .filter(({ actor }) => actor.kind === 'agent' && actor.name === agent)
      .map(({ itemId }) => itemId),
  );
  for (const id of asked) {
    const item = requireItem(ctx.db, id);
    const board = liveBoardOf(ctx, item.collection);
    const position = positionOf(item.state);
    if (!board || isClosed(position) || position.phase !== 'doing') continue;
    const on = itemOnBoard(ctx, item, board.def);
    const answered = on.roundQuestions.findLast((q) => q.by === agent && q.answer);
    const at = answered?.answer?.at;
    // An answer it noted from the chat itself is one it knows.
    if (!answered || at === undefined || answered.answer?.via === agent) continue;
    const acted = selectEvents(ctx.db, item.id).some(
      (event) => event.at > at && event.actor.kind === 'agent' && event.actor.name === agent,
    );
    if (!acted)
      return { item: item.id, question: answered.question, text: waitAnswerText(item.id) };
  }
  return undefined;
}

// The items where a question this agent asked still waits for the person, oldest first. While one
// does, otea wait keeps the agent on its answer: other free work would wake it only for it to end
// its turn there, and the answer would go unread.
export function askedByAgent(ctx: Context, agent: string): string[] {
  return [...askingItems(ctx.db)]
    .filter(([, open]) => open.by === agent)
    .sort(([, a], [, b]) => a.at.localeCompare(b.at))
    .map(([id]) => id);
}

// While a question this agent asked waits for the person, the agent work that still wakes its wait
// (P4-R2-1): an item sent back that it worked on, and work that reached its state after it first
// asked. Work already free when it asked does not: it would wake the agent at once, only for it to
// end its turn there with the answer unread. Undefined while no question of its waits.
export function wakesWhileAsking(
  ctx: Context,
  agent: string,
): ((item: { id: string; createdAt: string }) => boolean) | undefined {
  const asking = askingItems(ctx.db);
  const asked = [...asking.values()]
    .filter((open) => open.by === agent)
    .map(({ at }) => at)
    .sort()[0];
  if (asked === undefined) return undefined;
  const entered = selectStateEntries(ctx.db);
  return (item) => {
    // An item a question waits on is the person's until they answer it.
    if (asking.has(item.id)) return false;
    if ((entered.get(item.id) ?? item.createdAt) > asked) return true;
    const record = requireItem(ctx.db, item.id);
    const events = selectEvents(ctx.db, item.id);
    const mine = ({ actor }: { actor: Actor }) => actor.kind === 'agent' && actor.name === agent;
    // What happened since it asked, while it did nothing on the item after it (P7-R3-9): the
    // person took the item up (a note, Retomar, any act of theirs that lifted a set-aside), or,
    // on an item it holds, the parts or blockers it waited for closed: its work again.
    const since = (at: string | undefined) =>
      at !== undefined && at > asked && !events.some((event) => event.at > at && mine(event));
    if (since(events.findLast(tookUp)?.at)) return true;
    if (record.lease?.holder === agent && since(waitsClosedAt(ctx, item.id))) return true;
    const board = liveBoardOf(ctx, record.collection);
    if (!board || itemOnBoard(ctx, record, board.def).sentBack === undefined) return false;
    return events.some(mine);
  };
}

// The person's own acts that take an item up: a note, or what lifted a set-aside (P7-R3-9).
function tookUp({ type, actor }: { type: string; actor: Actor }): boolean {
  return actor.kind === 'human' && (type === NOTE_LEFT || type === SET_ASIDE_LIFTED);
}

// When the last of the item's parts and blockers closed, while every one of them is closed;
// undefined while one is open or it has none.
function waitsClosedAt(ctx: Context, id: string): string | undefined {
  let last: string | undefined;
  for (const relation of selectRelationsOf(ctx.db, id)) {
    if (relation.to !== id || (relation.kind !== 'parent' && relation.kind !== 'blocks')) continue;
    const other = requireItem(ctx.db, relation.from);
    if (!isClosed(positionOf(other.state))) return undefined;
    const closed = selectEvents(ctx.db, other.id).findLast(({ type }) => type === 'transitioned');
    if (closed && (last === undefined || closed.at > last)) last = closed.at;
  }
  return last;
}
