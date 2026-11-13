import { describe, expect, it } from 'vitest';
import {
  answersBlock,
  askedText,
  type ItemQuestion,
  legacyAsks,
  openQuestion,
  QUESTION_ANSWERED,
  QUESTION_ASKED,
  type QuestionEvent,
  questionsOf,
  waitAnswerText,
  waitingAnswerText,
} from './questions.ts';

const asked = (question: number, at: string, by = 'claude-d'): QuestionEvent => ({
  type: QUESTION_ASKED,
  actor: { kind: 'agent', name: by },
  at,
  data: { question, text: `¿pregunta ${question}?`, step: 'sdo', stepName: 'Hacerlo', round: 2 },
});

const answered = (question: number, at: string): QuestionEvent => ({
  type: QUESTION_ANSWERED,
  actor: { kind: 'human', name: 'fede' },
  at,
  data: { question, text: `respuesta ${question}` },
});

const question = (n: number, extra: Partial<ItemQuestion> = {}): ItemQuestion => ({
  question: n,
  text: `¿pregunta ${n}?`,
  at: '2026-11-13T13:00:00.000Z',
  by: 'claude-d',
  step: 'sdo',
  stepName: 'Hacerlo',
  round: 2,
  ...extra,
});

describe('an agent’s questions to the person, read from the item’s events', () => {
  it('reads each question with its moment and its answer, oldest first', () => {
    const events = [
      { type: 'transitioned', actor: { kind: 'agent', name: 'x' }, at: 'a', data: {} },
      asked(1, '2026-11-13T13:00:00.000Z'),
      answered(1, '2026-11-13T13:05:00.000Z'),
      answered(1, '2026-11-13T13:06:00.000Z'),
      asked(2, '2026-11-13T13:10:00.000Z'),
    ] satisfies QuestionEvent[];
    expect(questionsOf(events)).toEqual([
      question(1, {
        answer: { text: 'respuesta 1', at: '2026-11-13T13:05:00.000Z', by: 'fede' },
      }),
      question(2, { at: '2026-11-13T13:10:00.000Z' }),
    ]);
  });

  it('an item’s question stays open until it is answered or the item moves', () => {
    const move: QuestionEvent = {
      type: 'transitioned',
      actor: { kind: 'human', name: 'fede' },
      at: 'm',
      data: {},
    };
    const one = asked(1, '2026-11-13T13:00:00.000Z');
    expect(openQuestion([one])?.question).toBe(1);
    expect(openQuestion([one, answered(1, 'b')])).toBeUndefined();
    expect(openQuestion([one, move])).toBeUndefined();
    expect(openQuestion([move, one])?.text).toBe('¿pregunta 1?');
    expect(openQuestion([])).toBeUndefined();
  });
});

describe('what agents read of a question', () => {
  it('says the turn is the person’s once asked, and how to hear the answer', () => {
    expect(askedText('BUG-4')).toBe(
      'Asked the person on BUG-4: the turn is theirs until they answer; the step, round and lease stay as they are. otea wait --turn agent wakes you when they answer; read it then: otea show BUG-4',
    );
    expect(waitAnswerText('BUG-4')).toBe(
      'BUG-4: the person answered your question. Read it: otea show BUG-4',
    );
  });

  it('says whose question waits for the person', () => {
    expect(waitingAnswerText(question(1), 'claude-d')).toEqual([
      'Waiting for the person to answer your question: "¿pregunta 1?"',
      '  The turn is theirs: do not hand it off yet; otea wait --turn agent wakes you when they answer.',
    ]);
    expect(waitingAnswerText(question(1), 'other')[0]).toBe(
      'Waiting for the person to answer claude-d\'s question: "¿pregunta 1?"',
    );
  });

  it('gives each answered question with the person’s answer, newest first', () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    const lines = answersBlock(
      [
        question(1, { answer: { text: 'la A', at, by: 'fede' } }),
        question(2, { text: 'línea uno\nlínea dos', answer: { text: 'la B', at, by: 'fede' } }),
        question(3),
      ],
      'claude-d',
    );
    expect(lines).toEqual([
      '',
      'You asked the person: "línea uno',
      '  línea dos"',
      'The person answered: "la B"',
      expect.stringMatching(/^ {2}.+; address it in this round\.$/),
      '',
      'You asked the person: "¿pregunta 1?"',
      'The person answered: "la A"',
      expect.stringMatching(/; address it in this round\.$/),
    ]);
  });

  it('reads an old handoff ending in a question mark as a question, for old events only', () => {
    expect(legacyAsks('¿A o B? ')).toBe(true);
    expect(legacyAsks('Listo.')).toBe(false);
    expect(legacyAsks(undefined)).toBe(false);
  });
});
