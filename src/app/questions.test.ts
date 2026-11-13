import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import { creatures } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { insertEvidence, selectEvents } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem, getItem, listItems, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import { handoffItem, itemNextText, nextFor } from './next.ts';
import { answerQuestion, answerWaiting, askQuestion } from './questions.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };
const scout = { kind: 'agent' as const, name: 'scout' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 13, 13, 0, tick++)).toISOString();

function refusal(run: () => unknown): OteaError {
  try {
    run();
  } catch (error) {
    if (error instanceof OteaError) return error;
    throw error;
  }
  throw new Error('not refused');
}

// A creature kiln claimed in Concepto, on a published board.
function working(ctx: Context) {
  const def = creatures();
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  const item = createItem(
    ctx,
    { collection: 'Criaturas', title: 'Tortuga', fields: { fdesc: 'Lenta' }, actor: you },
    now,
  );
  claimItem(ctx, { id: item.id, actor: kiln }, now);
  return item;
}

// The Arte conceptual Concepto asks for, so kiln may hand it off.
function attach(ctx: Context, id: string) {
  insertEvidence(ctx.db, {
    itemId: id,
    role: 'after',
    module: 'eart',
    kind: 'image',
    filename: 'a.png',
    contentType: 'image/png',
    size: 1,
    sha256: 'a'.repeat(64),
    caption: null,
    createdAt: now(),
    actor: kiln,
    channel: 'cli',
  });
}

const ask = (ctx: Context, id: string, text = '¿Caparazón liso o con musgo?') =>
  askQuestion(ctx, { id, text, actor: kiln, channel: 'cli' }, now);

describe('an agent asks the person', () => {
  it('hands the turn to the person and moves nothing: step, round and lease stay', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const before = getItem(ctx, item.id, now);

    const asked = ask(ctx, item.id);

    expect(asked.question).toMatchObject({
      question: 1,
      text: '¿Caparazón liso o con musgo?',
      by: 'kiln',
      step: 'sconcept',
      stepName: 'Concepto',
      round: 1,
    });
    expect(asked.text).toContain('the turn is theirs until they answer');
    const after = getItem(ctx, item.id, now);
    expect(after.state).toBe(before.state);
    expect(after.lease?.holder).toBe('kiln');
    expect(after.turn).toBe('human');
    expect(after.asks).toEqual({
      question: 1,
      by: 'kiln',
      text: '¿Caparazón liso o con musgo?',
      at: asked.question.at,
    });
    expect(listItems(ctx, { turn: 'human' }).map(({ id }) => id)).toEqual([item.id]);
    expect(listItems(ctx, { turn: 'agent' })).toEqual([]);
    expect(selectEvents(ctx.db, item.id).at(-1)).toMatchObject({
      type: 'question_asked',
      actor: kiln,
      data: { question: 1, step: 'sconcept', round: 1, channel: 'cli' },
    });
  });

  it('is the agent’s alone, with words, on a step an agent is doing, one question at a time', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const by =
      (actor: typeof you | typeof kiln, text = '¿A?') =>
      () =>
        askQuestion(ctx, { id: item.id, text, actor, channel: 'ui' }, now);
    expect(refusal(by(you)).code).toBe('forbidden');
    expect(refusal(by(kiln, '  ')).code).toBe('reason_required');
    expect(refusal(by(scout)).code).toBe('lease_held');
    ask(ctx, item.id);
    expect(refusal(by(kiln)).message).toContain('already waits for the person');
  });

  it('is refused off a step an agent is doing', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    const error = refusal(() => ask(ctx, item.id));
    expect(error.code).toBe('invalid_transition');
    expect(error.message).toContain('ask only while you do a step');
  });

  it('keeps the agent from handing off and other agents off the item until answered', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    ask(ctx, item.id);
    const error = refusal(() => handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }));
    expect(error.code).toBe('invalid_transition');
    expect(error.message).toContain('waits for their answer');
    expect(nextFor(ctx, 'scout', {}, now).item).toBeNull();
    expect(itemNextText(ctx, getItem(ctx, item.id, now), 'kiln', now)).toContain(
      'Waiting for the person to answer your question: "¿Caparazón liso o con musgo?"',
    );
  });
});

describe('the person answers', () => {
  it('gives the turn back to the agent in the same round, which reads the answer', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    attach(ctx, item.id);
    ask(ctx, item.id);
    expect(answerWaiting(ctx, 'kiln')).toBeUndefined();

    const answered = answerQuestion(
      ctx,
      { id: item.id, text: 'Con musgo', actor: you, channel: 'ui' },
      now,
    );

    expect(answered.answer).toMatchObject({ text: 'Con musgo', by: 'fede' });
    const after = getItem(ctx, item.id, now);
    expect(after.turn).toBe('agent');
    expect(after.asks).toBeUndefined();
    expect(after.lease?.holder).toBe('kiln');
    const text = itemNextText(ctx, after, 'kiln', now) ?? '';
    expect(text).toContain('Concepto, round 1');
    expect(text).toContain('You asked the person: "¿Caparazón liso o con musgo?"');
    expect(text).toContain('The person answered: "Con musgo"');
    expect(showItem(ctx, item.id, { actor: kiln, channel: 'cli' }, now).board?.questions).toEqual([
      expect.objectContaining({
        question: 1,
        answer: expect.objectContaining({ text: 'Con musgo' }),
      }),
    ]);
    expect(answerWaiting(ctx, 'kiln')).toEqual({
      item: item.id,
      question: 1,
      text: `${item.id}: the person answered your question. Read it: otea show ${item.id}`,
    });
    expect(answerWaiting(ctx, 'scout')).toBeUndefined();
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    expect(answerWaiting(ctx, 'kiln')).toBeUndefined();
  });

  it('is the person’s alone, with words, and only while a question waits', () => {
    const ctx = memoryContext();
    const item = working(ctx);
    const answer =
      (actor: typeof you | typeof kiln, text = 'Sí') =>
      () =>
        answerQuestion(ctx, { id: item.id, text, actor, channel: 'ui' }, now);
    expect(refusal(answer(you)).message).toContain('no question waits');
    ask(ctx, item.id);
    expect(refusal(answer(kiln)).code).toBe('forbidden');
    expect(refusal(answer(you, ' ')).code).toBe('reason_required');
    answer(you)();
    expect(refusal(answer(you)).message).toContain('no question waits');
  });
});
