import type { Channel } from '../core/authority.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { stepById } from '../core/board/model.ts';
import {
  askedText,
  type ItemQuestion,
  QUESTION_ANSWERED,
  QUESTION_ASKED,
  questionsOf,
  waitAnswerText,
} from '../core/board/questions.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type ItemRecord,
  selectEvents,
  selectEventsOfTypes,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { requireItem, requireWritableItem, systemClock } from './items.ts';
import { itemOnBoard, type LiveBoard, liveBoardOf } from './next.ts';

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
    assertMayWrite(item.id, activeLease(item.lease, at), input.actor);
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
  return transaction(ctx.db, () => {
    const item = requireWritableItem(ctx.db, id);
    const board = liveBoardOf(ctx, item.collection);
    const open = board ? itemOnBoard(ctx, item, board.def).asking : undefined;
    if (!open)
      refuse('invalid_transition', item.id, 'none_open', `${item.id}: no question waits for you`);
    appendEvent(ctx.db, {
      itemId: item.id,
      type: QUESTION_ANSWERED,
      actor: input.actor,
      at: now(),
      data: { question: open.question, text, channel: input.channel },
    });
    const answered = questionsOf(selectEvents(ctx.db, item.id)).find(
      (each) => each.question === open.question,
    );
    if (!answered) throw new Error(`question ${open.question} on ${item.id} was not kept`);
    return answered;
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
    if (!answered || at === undefined) continue;
    const acted = selectEvents(ctx.db, item.id).some(
      (event) => event.at > at && event.actor.kind === 'agent' && event.actor.name === agent,
    );
    if (!acted)
      return { item: item.id, question: answered.question, text: waitAnswerText(item.id) };
  }
  return undefined;
}
