import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import type { Context } from './context.ts';
import { memoryContext } from './testing.ts';
import {
  addTopic,
  answerFromSession,
  answerTopic,
  closeTopic,
  convertTopic,
  dismissTopicSuggestion,
  HANGING_AFTER_MS,
  linkTopic,
  listTopics,
  noteTopic,
  requireTopic,
  setTopicsOn,
  topicSuggestions,
  topicsAwaiting,
  topicsOfItem,
  topicsOn,
  topicWaiting,
} from './topics.ts';

const quill: Actor = { kind: 'agent', name: 'quill' };
const fede: Actor = { kind: 'human', name: 'fede' };

let ctx: Context;
let clock: number;
const now = () => new Date(clock).toISOString();
const later = (ms: number) => {
  clock += ms;
};

function seedItem(id: string, by: Actor = quill, at = now()): void {
  ctx.db.exec(
    `INSERT OR IGNORE INTO collections (name, prefix, next_seq) VALUES ('Tareas', 'TAR', 1)`,
  );
  ctx.db
    .prepare(
      `INSERT INTO items (id, collection, seq, title, state, created_at, updated_at,
        created_by_kind, created_by_name)
       VALUES (?, 'Tareas', ?, 'una tarea', 'open', ?, ?, ?, ?)`,
    )
    .run(id, Number(id.split('-')[1]), at, at, by.kind, by.name);
}

beforeEach(() => {
  ctx = memoryContext();
  clock = Date.parse('2026-11-17T10:00:00.000Z');
});

describe('topics switch', () => {
  it('is off until the person turns it on', () => {
    expect(topicsOn(ctx)).toBe(false);
    setTopicsOn(ctx, true);
    expect(topicsOn(ctx)).toBe(true);
    setTopicsOn(ctx, false);
    expect(topicsOn(ctx)).toBe(false);
  });
});

describe('a topic', () => {
  it('opens with the question as the agent turn, numbered TEM-n', () => {
    const first = addTopic(
      ctx,
      { question: '¿Por qué falla el build en Windows?', actor: quill },
      now,
    );
    const second = addTopic(ctx, { question: 'Otra cosa', actor: quill }, now);

    expect(first).toMatchObject({
      id: 'TEM-1',
      title: '¿Por qué falla el build en Windows?',
      state: 'open',
      turn: 'agent',
      agent: 'quill',
      turns: [{ n: 1, kind: 'question', text: '¿Por qué falla el build en Windows?' }],
    });
    expect(second.id).toBe('TEM-2');
  });

  it('takes a short title apart from a long question', () => {
    const topic = addTopic(
      ctx,
      { title: 'Build en Windows', question: 'Una pregunta larga…', actor: quill },
      now,
    );
    expect(topic.title).toBe('Build en Windows');
  });

  it('refuses an empty question', () => {
    expect(() => addTopic(ctx, { question: '  ', actor: quill }, now)).toThrow(
      expect.objectContaining({ code: 'invalid_fields' }),
    );
  });

  it('keeps the session and how to resume it when known', () => {
    const topic = addTopic(
      ctx,
      { question: 'q', actor: quill, session: 'abc', resume: 'claude --resume abc' },
      now,
    );
    expect(topic).toMatchObject({ session: 'abc', resume: 'claude --resume abc' });
  });

  it('is answered with a summary and the full answer, and becomes the person turn', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    later(1000);
    const answered = answerTopic(
      ctx,
      { id: 'TEM-1', summary: 'Falta una variable.', full: 'Texto completo…', actor: quill },
      now,
    );

    expect(answered).toMatchObject({ state: 'answered', turn: 'human' });
    expect(answered.turns.at(-1)).toMatchObject({
      kind: 'answer',
      text: 'Falta una variable.',
      full: 'Texto completo…',
      source: 'agent',
    });
  });

  it('lets the answer read from the session win over the agent copy, whichever comes first', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 's', full: 'copia', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', full: 'de la sesión', source: 'session', actor: quill }, now);
    expect(requireTopic(ctx, 'TEM-1', now).turns).toHaveLength(2);
    expect(requireTopic(ctx, 'TEM-1', now).turns[1]).toMatchObject({
      text: 's',
      full: 'de la sesión',
      source: 'session',
    });

    answerTopic(ctx, { id: 'TEM-1', summary: 's2', full: 'otra copia', actor: quill }, now);
    expect(requireTopic(ctx, 'TEM-1', now).turns[1]).toMatchObject({
      text: 's2',
      full: 'de la sesión',
      source: 'session',
    });
  });

  it('refuses an answer from the person', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    expect(() => answerTopic(ctx, { id: 'TEM-1', summary: 's', actor: fede }, now)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });

  it('goes back to the agent with a note from the person, which a waiting agent gets once', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 's', actor: quill }, now);
    const noted = noteTopic(ctx, { id: 'TEM-1', text: '¿Y en Linux?', actor: fede }, now);

    expect(noted).toMatchObject({ state: 'open', turn: 'agent' });
    expect(topicWaiting(ctx, 'other', now)).toBeUndefined();
    const waiting = topicWaiting(ctx, 'quill', now);
    expect(waiting).toMatchObject({ topic: 'TEM-1', note: '¿Y en Linux?' });
    expect(waiting?.text).toContain('TEM-1');
    expect(waiting?.text).toContain('otea topic answer TEM-1');
    expect(topicWaiting(ctx, 'quill', now)).toBeUndefined();
  });

  it('is left hanging after a day untouched while it is the agent turn', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    later(HANGING_AFTER_MS - 1);
    expect(requireTopic(ctx, 'TEM-1', now).state).toBe('open');
    later(2);
    expect(requireTopic(ctx, 'TEM-1', now).state).toBe('hanging');
  });

  it('is closed by the person only', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 's', actor: quill }, now);
    expect(() => closeTopic(ctx, { id: 'TEM-1', actor: quill }, now)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(closeTopic(ctx, { id: 'TEM-1', actor: fede }, now)).toMatchObject({
      state: 'closed',
      turn: 'none',
    });
  });
});

describe('topics and items', () => {
  it('turns into a task, linked both ways', () => {
    seedItem('TAR-1');
    addTopic(ctx, { question: 'q', actor: quill }, now);
    const converted = convertTopic(ctx, { id: 'TEM-1', item: 'TAR-1', actor: fede }, now);

    expect(converted).toMatchObject({ state: 'task', task: 'TAR-1', links: ['TAR-1'] });
    expect(topicsOfItem(ctx, 'TAR-1', now)).toEqual([
      expect.objectContaining({ id: 'TEM-1', pending: false }),
    ]);
  });

  it('is linked by the agent that makes a task from it, and stays pending until closed', () => {
    seedItem('TAR-1');
    addTopic(ctx, { question: 'q', actor: quill }, now);
    linkTopic(ctx, { id: 'TEM-1', item: 'TAR-1', via: 'from' }, now);

    expect(topicsOfItem(ctx, 'TAR-1', now)).toEqual([
      expect.objectContaining({ id: 'TEM-1', pending: true }),
    ]);
  });

  it('is suggested for a task the same agent made soon after, until linked or dismissed', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    later(60_000);
    seedItem('TAR-1');
    seedItem('TAR-2', { kind: 'agent', name: 'brush' });

    expect(topicSuggestions(ctx, 'TAR-1', now).map(({ id }) => id)).toEqual(['TEM-1']);
    expect(topicSuggestions(ctx, 'TAR-2', now)).toEqual([]);

    dismissTopicSuggestion(ctx, { id: 'TEM-1', item: 'TAR-1' }, now);
    expect(topicSuggestions(ctx, 'TAR-1', now)).toEqual([]);
    expect(topicsOfItem(ctx, 'TAR-1', now)).toEqual([]);
  });

  it('suggests a topic of the same session even from another agent name', () => {
    addTopic(ctx, { question: 'q', actor: quill, session: 's-1' }, now);
    seedItem('TAR-1', { kind: 'agent', name: 'brush' });
    expect(topicSuggestions(ctx, 'TAR-1', now, 's-1').map(({ id }) => id)).toEqual(['TEM-1']);
  });
});

describe('topics awaiting an agent', () => {
  it('are its open ones: a question it has not answered, or a note the person left', () => {
    addTopic(ctx, { question: 'sin responder', actor: quill }, now);
    addTopic(ctx, { question: 'respondido', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-2', summary: 's', actor: quill }, now);
    addTopic(ctx, { question: 'con nota', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-3', summary: 's', actor: quill }, now);
    noteTopic(ctx, { id: 'TEM-3', text: '¿Y en Linux?', actor: fede }, now);
    topicWaiting(ctx, 'quill', now);
    addTopic(ctx, { question: 'de otro', actor: { kind: 'agent', name: 'ink' } }, now);

    expect(topicsAwaiting(ctx, 'quill', now).map(({ id }) => id)).toEqual(['TEM-1', 'TEM-3']);
  });
});

describe('the list', () => {
  it('puts what is left hanging first, then open, answered, and hides closed ones unless asked', () => {
    addTopic(ctx, { question: 'viejo', actor: quill }, now);
    later(HANGING_AFTER_MS + 1);
    addTopic(ctx, { question: 'abierto', actor: quill }, now);
    addTopic(ctx, { question: 'respondido', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-3', summary: 's', actor: quill }, now);
    addTopic(ctx, { question: 'cerrado', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-4', summary: 's', actor: quill }, now);
    closeTopic(ctx, { id: 'TEM-4', actor: fede }, now);

    expect(listTopics(ctx, {}, now).map(({ id, state }) => `${id} ${state}`)).toEqual([
      'TEM-1 hanging',
      'TEM-2 open',
      'TEM-3 answered',
    ]);
    expect(listTopics(ctx, { all: true }, now).map(({ id }) => id)).toContain('TEM-4');
  });
});

describe('an answer read from the session', () => {
  it('fills in the full answer of the topic the agent answered this turn, by its session', () => {
    addTopic(ctx, { question: 'q', actor: quill, session: 's-1' }, now);
    later(5_000);
    const since = now();
    later(1_000);
    answerTopic(ctx, { id: 'TEM-1', summary: 'corto', full: 'copia', actor: quill }, now);

    expect(answerFromSession(ctx, { session: 's-1', since, text: 'Lo que escribió.' }, now)).toBe(
      'TEM-1',
    );
    expect(requireTopic(ctx, 'TEM-1', now).turns.at(-1)).toMatchObject({
      text: 'corto',
      full: 'Lo que escribió.',
      source: 'session',
    });
  });

  it('takes the one topic answered this turn when no session was given, and never an older one', () => {
    addTopic(ctx, { question: 'viejo', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 's', actor: quill }, now);
    later(60_000);
    const since = now();
    later(1_000);
    addTopic(ctx, { question: 'nuevo', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-2', summary: 's', actor: quill }, now);

    expect(answerFromSession(ctx, { session: 's-9', since, text: 'texto' }, now)).toBe('TEM-2');
    expect(requireTopic(ctx, 'TEM-2', now).session).toBe('s-9');
    expect(requireTopic(ctx, 'TEM-1', now).turns.at(-1)?.source).toBe('agent');
  });

  it('leaves out the lines that only say the topic was recorded', () => {
    addTopic(ctx, { question: 'q', actor: quill, session: 's-1' }, now);
    const since = now();
    later(1_000);
    answerTopic(ctx, { id: 'TEM-1', summary: 'corto', actor: quill }, now);
    const said =
      'Defender escanea node_modules.\n\nLo dejé registrado en otea como TEM-1 con la respuesta.';

    expect(answerFromSession(ctx, { session: 's-1', since, text: said }, now)).toBe('TEM-1');
    expect(requireTopic(ctx, 'TEM-1', now).turns.at(-1)?.full).toBe(
      'Defender escanea node_modules.',
    );
  });

  it('keeps the agent copy when the chat said nothing but that the topic was recorded', () => {
    addTopic(ctx, { question: 'q', actor: quill, session: 's-1' }, now);
    const since = now();
    later(1_000);
    answerTopic(ctx, { id: 'TEM-1', summary: 'corto', full: 'copia', actor: quill }, now);

    expect(
      answerFromSession(ctx, { session: 's-1', since, text: 'Registrado como TEM-1.' }, now),
    ).toBeUndefined();
    expect(requireTopic(ctx, 'TEM-1', now).turns.at(-1)?.full).toBe('copia');
  });

  it('does nothing when it cannot tell which topic, or none was answered this turn', () => {
    const since = now();
    later(1_000);
    expect(answerFromSession(ctx, { session: 's', since, text: 't' }, now)).toBeUndefined();
    addTopic(ctx, { question: 'a', actor: quill }, now);
    addTopic(ctx, { question: 'b', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 's', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-2', summary: 's', actor: quill }, now);
    expect(answerFromSession(ctx, { session: 's', since, text: 't' }, now)).toBeUndefined();
  });
});
