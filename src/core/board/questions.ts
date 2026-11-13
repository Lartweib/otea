import { timeText } from '../time.ts';

// An agent's question to the person (otea ask): asking hands the turn to the person without moving
// the item (the step, its round and the lease stay as they are); the person's answer hands it back
// to the agent, which reads it in next and show, as a send-back note, in the same round. A question
// is open while unanswered in the round of the step it was asked in. The thread is the item's
// question_asked and question_answered events; this module reads it and writes what agents read of
// it, in English, as the rest of what agents read (core/board/next.ts). Doubts never go in the
// person's notes thread (core/board/notes.ts): that one is the person's, and changes no turn.

export const QUESTION_ASKED = 'question_asked';
export const QUESTION_ANSWERED = 'question_answered';

export type QuestionAnswer = { text: string; at: string; by: string };

// A question and the moment it was asked in: the step (by id and by name then) and its round.
export type ItemQuestion = {
  question: number;
  text: string;
  at: string;
  by: string;
  step: string;
  stepName: string;
  round: number;
  answer?: QuestionAnswer;
};

export type QuestionEvent = {
  type: string;
  actor: { kind: 'human' | 'agent'; name: string };
  at: string;
  data: Record<string, unknown>;
};

// The item's questions, oldest first, each with its answer once there is one.
export function questionsOf(events: readonly QuestionEvent[]): ItemQuestion[] {
  const out = new Map<number, ItemQuestion>();
  for (const { type, actor, at, data } of events) {
    if (typeof data.question !== 'number') continue;
    if (type === QUESTION_ASKED) {
      out.set(data.question, {
        question: data.question,
        text: String(data.text ?? ''),
        at,
        by: actor.name,
        step: String(data.step ?? ''),
        stepName: String(data.stepName ?? data.step ?? ''),
        round: typeof data.round === 'number' ? data.round : 1,
      });
    } else if (type === QUESTION_ANSWERED) {
      const asked = out.get(data.question);
      if (!asked || asked.answer) continue;
      asked.answer = { text: String(data.text ?? ''), at, by: actor.name };
    }
  }
  return [...out.values()];
}

// The question an item's events leave open (oldest first): asked, not answered, and the item not
// moved since. A move ends the round it was asked in, and with it the question.
export function openQuestion(events: readonly QuestionEvent[]): ItemQuestion | undefined {
  let open: number | undefined;
  for (const { type, data } of events) {
    if (type === 'transitioned') open = undefined;
    else if (type === QUESTION_ASKED && typeof data.question === 'number') open = data.question;
    else if (type === QUESTION_ANSWERED && data.question === open) open = undefined;
  }
  if (open === undefined) return undefined;
  return questionsOf(events).find(({ question }) => question === open);
}

// The text quoted: its first line opens the quote, later lines indented under it.
function quoted(head: string, text: string, indent: string): string[] {
  const [first = '', ...rest] = text.trim().split(/\r?\n/);
  const lines = [`${head}"${first}`, ...rest.map((line) => `${indent}${line}`)];
  lines[lines.length - 1] += '"';
  return lines;
}

const WAKE = 'otea wait --turn agent wakes you when they answer';

// What otea ask says once the question is asked.
export function askedText(id: string): string {
  return `Asked the person on ${id}: the turn is theirs until they answer; the step, round and lease stay as they are. ${WAKE}; read it then: otea show ${id}`;
}

// What next and show say of an item whose question waits for the person.
export function waitingAnswerText(question: ItemQuestion, me?: string): string[] {
  const who = question.by === me ? 'your' : `${question.by}'s`;
  return [
    ...quoted(`Waiting for the person to answer ${who} question: `, question.text, '  '),
    `  The turn is theirs: do not hand it off yet; ${WAKE}.`,
  ];
}

// next's and show's block for the round's answered questions, newest first: each question and the
// person's answer, which the agent addresses as a send-back note.
export function answersBlock(questions: readonly ItemQuestion[], me?: string): string[] {
  const answered = questions.filter((each) => each.answer !== undefined).reverse();
  return answered.flatMap(({ text, by, answer }) => {
    if (!answer) return [];
    const who = by === me ? 'You' : by;
    return [
      '',
      ...quoted(`${who} asked the person: `, text, '  '),
      ...quoted('The person answered: ', answer.text, '  '),
      `  ${timeText(answer.at)}; address it in this round.`,
    ];
  });
}

// What otea wait says when an answer wakes it.
export function waitAnswerText(id: string): string {
  return `${id}: the person answered your question. Read it: otea show ${id}`;
}

// Whether a handoff's words ask the person something: how an agent asked before otea ask, kept only
// to read old events that way.
export function legacyAsks(reason: string | undefined): boolean {
  return (reason ?? '').trim().endsWith('?');
}
