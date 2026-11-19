import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import type { Context } from './context.ts';
import { memoryContext } from './testing.ts';
import {
  addTopic,
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
  topicsAwaitingText,
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

// P4-R2-5: a follow-up became a topic of its own, apart from the one it follows.
describe('a follow-up', () => {
  it('goes on the topic it follows as a new question, the agent turn again', () => {
    addTopic(ctx, { question: '¿Cuánto cuesta el envío?', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 'Cinco euros.', actor: quill }, now);
    later(1000);
    const followed = addTopic(
      ctx,
      { to: 'tem-1', question: '¿Y en moto?', actor: { kind: 'agent', name: 'ink' } },
      now,
    );

    expect(followed).toMatchObject({ id: 'TEM-1', state: 'open', turn: 'agent', agent: 'ink' });
    expect(followed.turns.map(({ kind, text }) => `${kind} ${text}`)).toEqual([
      'question ¿Cuánto cuesta el envío?',
      'answer Cinco euros.',
      'question ¿Y en moto?',
    ]);
    expect(listTopics(ctx, { all: true }, now).map(({ id }) => id)).toEqual(['TEM-1']);
    const answered = answerTopic(
      ctx,
      { id: 'TEM-1', summary: 'Tres euros.', actor: { kind: 'agent', name: 'ink' } },
      now,
    );
    expect(answered.turns.map(({ kind }) => kind)).toEqual([
      'question',
      'answer',
      'question',
      'answer',
    ]);
  });

  it('opens a closed topic again', () => {
    addTopic(ctx, { question: 'q', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 's', actor: quill }, now);
    closeTopic(ctx, { id: 'TEM-1', actor: fede }, now);

    expect(addTopic(ctx, { to: 'TEM-1', question: '¿Y?', actor: quill }, now).state).toBe('open');
  });

  it('is refused on a topic that became a task, and on one that does not exist', () => {
    seedItem('TAR-1');
    addTopic(ctx, { question: 'q', actor: quill }, now);
    convertTopic(ctx, { id: 'TEM-1', item: 'TAR-1', actor: fede }, now);

    expect(() => addTopic(ctx, { to: 'TEM-1', question: '¿Y?', actor: quill }, now)).toThrow(
      expect.objectContaining({
        code: 'invalid_transition',
        message: expect.stringContaining('TAR-1'),
      }),
    );
    expect(() => addTopic(ctx, { to: 'TEM-9', question: '¿Y?', actor: quill }, now)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
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

  it('say what the person wrote since the last answer, so next is enough to answer it', () => {
    addTopic(ctx, { question: 'sin responder', actor: quill }, now);
    addTopic(ctx, { question: 'con nota', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-2', summary: 'Funciona en macOS.', actor: quill }, now);
    noteTopic(ctx, { id: 'TEM-2', text: '¿Y en Linux?', actor: fede }, now);
    noteTopic(ctx, { id: 'TEM-2', text: 'Y en Windows', actor: fede }, now);
    topicWaiting(ctx, 'quill', now);

    const answer = 'otea topic answer <id> --summary "<short answer>" --full "<your full answer>"';
    expect(topicsAwaitingText(topicsAwaiting(ctx, 'quill', now))).toBe(
      [
        'Topics waiting for your answer (the person reads it in Temas):',
        `  TEM-1 "sin responder": ${answer.replace('<id>', 'TEM-1')}`,
        `  TEM-2 "con nota": the person wrote after your answer: "¿Y en Linux?" "Y en Windows". Answer it: ${answer.replace('<id>', 'TEM-2')}`,
      ].join('\n'),
    );
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

describe('searching topics', () => {
  it('finds words in the title, the question, the summary and the full answer, closed ones too', () => {
    addTopic(ctx, { question: '¿Conviene ESM o CommonJS?', actor: quill }, now);
    answerTopic(
      ctx,
      {
        id: 'TEM-1',
        summary: 'ESM.',
        full: 'Hoy conviene ESM: Node lo soporta sin flags.',
        actor: quill,
      },
      now,
    );
    closeTopic(ctx, { id: 'TEM-1', actor: fede }, now);
    addTopic(ctx, { question: '¿Qué licencia uso?', title: 'Licencia', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-2', summary: 'MIT, por simple.', actor: quill }, now);
    addTopic(ctx, { question: 'Otra cosa', actor: quill }, now);

    const ids = (search: string) => listTopics(ctx, { search }, now).map(({ id }) => id);
    expect(ids('commonjs')).toEqual(['TEM-1']);
    expect(ids('sin flags')).toEqual(['TEM-1']);
    expect(ids('mit')).toEqual(['TEM-2']);
    expect(ids('LICENCIA')).toEqual(['TEM-2']);
    expect(ids('nada de esto')).toEqual([]);
  });

  it('ignores accents, and finds a topic with any of the words, the most words first', () => {
    addTopic(ctx, { question: 'La migracion de datos', actor: quill }, now);
    addTopic(ctx, { question: '¿Qué concluimos sobre la migración?', actor: quill }, now);

    const ids = (search: string) => listTopics(ctx, { search }, now).map(({ id }) => id);
    expect(ids('migracion')).toEqual(['TEM-1', 'TEM-2']);
    expect(ids('migración concluimos')).toEqual(['TEM-2', 'TEM-1']);
    expect(ids('  ')).toEqual(['TEM-1', 'TEM-2']);
  });

  // P3C-R2-7: «cursor paginación» found nothing, as no topic held both words.
  it('finds a topic that holds only some of the words', () => {
    addTopic(ctx, { question: '¿Cómo paginamos la API?', title: 'Paginación', actor: quill }, now);
    answerTopic(ctx, { id: 'TEM-1', summary: 'Con offset y limit.', actor: quill }, now);

    expect(listTopics(ctx, { search: 'cursor paginación' }, now).map(({ id }) => id)).toEqual([
      'TEM-1',
    ]);
  });

  // P4-R2-5: «envios moto» missed the topic about «envíos en motos».
  it('folds plurals both ways: a plural finds the singular and a singular the plural', () => {
    addTopic(ctx, { question: '¿Cuánto cobramos los envíos en motos?', actor: quill }, now);
    addTopic(ctx, { question: 'Which test cases fail?', actor: quill }, now);
    addTopic(ctx, { question: '¿Y las paginaciones?', actor: quill }, now);

    const ids = (search: string) => listTopics(ctx, { search }, now).map(({ id }) => id);
    expect(ids('envio moto')).toEqual(['TEM-1']);
    expect(ids('envios')).toEqual(['TEM-1']);
    expect(ids('case')).toEqual(['TEM-2']);
    expect(ids('tests')).toEqual(['TEM-2']);
    expect(ids('paginacion')).toEqual(['TEM-3']);
  });

  it('skips words too common to tell topics apart, and matches whole words', () => {
    addTopic(ctx, { question: 'Node o Deno', actor: quill }, now);
    addTopic(ctx, { question: 'La licencia del proyecto', actor: quill }, now);

    const ids = (search: string) => listTopics(ctx, { search }, now).map(({ id }) => id);
    expect(ids('nada de esto')).toEqual([]);
    expect(ids('la licencia')).toEqual(['TEM-2']);
    expect(ids('ode')).toEqual([]);
  });
});
