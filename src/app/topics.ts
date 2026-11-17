import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { transaction } from '../store/database.ts';
import type { Context } from './context.ts';
import { requireItem, systemClock } from './items.ts';

// Side topics: questions the person asks an agent off the work at hand. Each is a short
// conversation, so none is left hanging in a chat: the person's question, the agent's answer (a
// summary, with the full answer folded), and notes that keep it going. They are not work: next
// never offers them and they take no lease. Off until the person turns them on for the project.
//
// Whose turn: open is the agent's (to answer); answered is the person's (to read and decide: close
// it, keep it going with a note, or turn it into a task). Only the person closes a topic. An open
// topic nobody touched for a day reads as left hanging.

export const HANGING_AFTER_MS = 24 * 60 * 60 * 1000;

// A task made by the same agent this long after a topic it opened is suggested as related to it.
export const SUGGEST_WITHIN_MS = 12 * 60 * 60 * 1000;

type StoredState = 'open' | 'answered' | 'closed' | 'task';
export type TopicState = StoredState | 'hanging';
// An event is a line Otea writes in the thread itself, such as the topic's task being deleted.
export type TopicTurnKind = 'question' | 'answer' | 'note' | 'event';
// Where an answer's full text came from: copied by the agent, or read from its session's transcript.
export type AnswerSource = 'agent' | 'session';

export type TopicTurn = {
  n: number;
  kind: TopicTurnKind;
  text: string;
  full?: string;
  source?: AnswerSource;
  by: Actor;
  at: string;
};

export type Topic = {
  id: string;
  title: string;
  state: TopicState;
  turn: 'agent' | 'human' | 'none';
  agent?: string;
  session?: string;
  resume?: string;
  task?: string;
  createdAt: string;
  updatedAt: string;
  by: Actor;
  turns: TopicTurn[];
  links: string[];
};

type TopicRow = {
  id: string;
  seq: number;
  title: string;
  state: StoredState;
  agent: string | null;
  session: string | null;
  resume: string | null;
  task: string | null;
  created_at: string;
  updated_at: string;
  created_by_kind: Actor['kind'];
  created_by_name: string;
};

type TurnRow = {
  id: number;
  kind: TopicTurnKind;
  text: string;
  full: string | null;
  source: AnswerSource | null;
  actor_kind: Actor['kind'];
  actor_name: string;
  at: string;
};

const TITLE_MAX = 120;

function refuse(
  code: 'forbidden' | 'invalid_fields' | 'invalid_transition',
  message: string,
): never {
  throw new OteaError(code, message);
}

export function topicsOn(ctx: Context): boolean {
  const row = ctx.db.prepare('SELECT enabled FROM topics_switch WHERE id = 1').get() as
    | { enabled: number }
    | undefined;
  return row?.enabled === 1;
}

export function setTopicsOn(ctx: Context, on: boolean): void {
  ctx.db
    .prepare(
      'INSERT INTO topics_switch (id, enabled) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled',
    )
    .run(on ? 1 : 0);
}

function effectiveState(row: TopicRow, nowIso: string): TopicState {
  if (row.state === 'open' && Date.parse(nowIso) - Date.parse(row.updated_at) > HANGING_AFTER_MS)
    return 'hanging';
  return row.state;
}

function turnOf(state: TopicState): Topic['turn'] {
  if (state === 'open' || state === 'hanging') return 'agent';
  if (state === 'answered') return 'human';
  return 'none';
}

function toTopic(ctx: Context, row: TopicRow, nowIso: string): Topic {
  const turns = (
    ctx.db
      .prepare(
        'SELECT id, kind, text, full, source, actor_kind, actor_name, at FROM topic_turns WHERE topic_id = ? ORDER BY id',
      )
      .all(row.id) as TurnRow[]
  ).map(
    (turn, index): TopicTurn => ({
      n: index + 1,
      kind: turn.kind,
      text: turn.text,
      ...(turn.full === null ? {} : { full: turn.full }),
      ...(turn.source === null ? {} : { source: turn.source }),
      by: { kind: turn.actor_kind, name: turn.actor_name },
      at: turn.at,
    }),
  );
  const links = (
    ctx.db
      .prepare(
        "SELECT item_id FROM topic_links WHERE topic_id = ? AND via <> 'dismissed' ORDER BY at",
      )
      .all(row.id) as { item_id: string }[]
  ).map(({ item_id }) => item_id);
  const state = effectiveState(row, nowIso);
  return {
    id: row.id,
    title: row.title,
    state,
    turn: turnOf(state),
    ...(row.agent === null ? {} : { agent: row.agent }),
    ...(row.session === null ? {} : { session: row.session }),
    ...(row.resume === null ? {} : { resume: row.resume }),
    ...(row.task === null ? {} : { task: row.task }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    by: { kind: row.created_by_kind, name: row.created_by_name },
    turns,
    links,
  };
}

function findRow(ctx: Context, id: string): TopicRow | undefined {
  return ctx.db.prepare('SELECT * FROM topics WHERE id = ? COLLATE NOCASE').get(id.trim()) as
    | TopicRow
    | undefined;
}

function requireRow(ctx: Context, id: string): TopicRow {
  const row = findRow(ctx, id);
  if (!row) throw new OteaError('not_found', `Topic "${id}" not found`);
  return row;
}

export function requireTopic(ctx: Context, id: string, now = systemClock): Topic {
  return toTopic(ctx, requireRow(ctx, id), now());
}

function titleOf(question: string): string {
  const line = question.trim().split(/\r?\n/)[0] ?? '';
  return line.length <= TITLE_MAX ? line : `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

function addTurn(
  ctx: Context,
  id: string,
  turn: { kind: TopicTurnKind; text: string; full?: string; source?: AnswerSource; by: Actor },
  at: string,
): void {
  ctx.db
    .prepare(
      `INSERT INTO topic_turns (topic_id, kind, text, full, source, actor_kind, actor_name, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      turn.kind,
      turn.text,
      turn.full ?? null,
      turn.source ?? null,
      turn.by.kind,
      turn.by.name,
      at,
    );
}

function setState(ctx: Context, id: string, state: StoredState, at: string): void {
  ctx.db.prepare('UPDATE topics SET state = ?, updated_at = ? WHERE id = ?').run(state, at, id);
}

export type AddTopicInput = {
  question: string;
  title?: string;
  actor: Actor;
  session?: string;
  resume?: string;
};

// Opens a topic with the person's question, the agent's turn to answer. An agent records the
// question the person asked it in its chat; the person may open one too.
export function addTopic(ctx: Context, input: AddTopicInput, now = systemClock): Topic {
  const question = input.question.trim();
  if (question === '') refuse('invalid_fields', 'A topic needs the question it is about');
  const title = input.title?.trim() || titleOf(question);
  const at = now();
  return transaction(ctx.db, () => {
    const seq =
      ((ctx.db.prepare('SELECT max(seq) AS seq FROM topics').get() as { seq: number | null }).seq ??
        0) + 1;
    const id = `TEM-${seq}`;
    const agent = input.actor.kind === 'agent' ? input.actor.name : null;
    ctx.db
      .prepare(
        `INSERT INTO topics (id, seq, title, state, agent, session, resume, created_at, updated_at,
           created_by_kind, created_by_name)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        seq,
        title,
        agent,
        input.session ?? null,
        input.resume ?? null,
        at,
        at,
        input.actor.kind,
        input.actor.name,
      );
    // The question is the person's, even when the agent writes it down.
    addTurn(ctx, id, { kind: 'question', text: question, by: input.actor }, at);
    return toTopic(ctx, requireRow(ctx, id), at);
  });
}

export type AnswerTopicInput = {
  id: string;
  summary?: string;
  full?: string;
  source?: AnswerSource;
  actor: Actor;
  session?: string;
  resume?: string;
};

// The agent's answer: a short summary to read in the list and the full answer, folded. An answer
// read from the session (the Claude Code hook) fills in the full text of the last answer, and wins
// over the agent's own copy, whichever came first.
export function answerTopic(ctx: Context, input: AnswerTopicInput, now = systemClock): Topic {
  if (input.actor.kind !== 'agent') refuse('forbidden', 'Only an agent answers a topic');
  const row = requireRow(ctx, input.id);
  if (row.state === 'closed' || row.state === 'task')
    refuse('invalid_transition', `${row.id} is closed: it takes no more answers`);
  const source = input.source ?? 'agent';
  const at = now();
  return transaction(ctx.db, () => {
    const last = ctx.db
      .prepare(
        'SELECT id, kind, text, full, source FROM topic_turns WHERE topic_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(row.id) as Pick<TurnRow, 'id' | 'kind' | 'text' | 'full' | 'source'> | undefined;
    const summary = input.summary?.trim();
    const full = input.full?.trim();
    if (last?.kind === 'answer') {
      // The same answer again: a later summary replaces the earlier one; the session's full text
      // stays once read.
      const keepFull = last.source === 'session' && source === 'agent';
      ctx.db
        .prepare('UPDATE topic_turns SET text = ?, full = ?, source = ? WHERE id = ?')
        .run(
          summary || last.text,
          keepFull ? last.full : (full ?? last.full),
          keepFull ? 'session' : source,
          last.id,
        );
    } else {
      if (!summary && source === 'agent')
        refuse('invalid_fields', 'An answer needs its summary (--summary)');
      addTurn(
        ctx,
        row.id,
        {
          kind: 'answer',
          text: summary || titleOf(full ?? ''),
          ...(full === undefined ? {} : { full }),
          source,
          by: input.actor,
        },
        at,
      );
    }
    if (input.session || input.resume)
      ctx.db
        .prepare(
          'UPDATE topics SET session = coalesce(?, session), resume = coalesce(?, resume) WHERE id = ?',
        )
        .run(input.session ?? null, input.resume ?? null, row.id);
    if (row.agent === null)
      ctx.db.prepare('UPDATE topics SET agent = ? WHERE id = ?').run(input.actor.name, row.id);
    setState(ctx, row.id, 'answered', at);
    return toTopic(ctx, requireRow(ctx, row.id), at);
  });
}

export type NoteTopicInput = { id: string; text: string; actor: Actor };

// The person keeps a topic going: the note goes to the agent that answered it, which a waiting
// agent gets with otea wait. A closed topic opens again.
export function noteTopic(ctx: Context, input: NoteTopicInput, now = systemClock): Topic {
  if (input.actor.kind !== 'human') refuse('forbidden', 'Only the person adds a note to a topic');
  const text = input.text.trim();
  if (text === '') refuse('invalid_fields', 'The note is empty');
  const row = requireRow(ctx, input.id);
  if (row.state === 'task')
    refuse('invalid_transition', `${row.id} became ${row.task}: keep it going there`);
  const at = now();
  return transaction(ctx.db, () => {
    addTurn(ctx, row.id, { kind: 'note', text, by: input.actor }, at);
    setState(ctx, row.id, 'open', at);
    return toTopic(ctx, requireRow(ctx, row.id), at);
  });
}

export function closeTopic(
  ctx: Context,
  input: { id: string; actor: Actor },
  now = systemClock,
): Topic {
  if (input.actor.kind !== 'human') refuse('forbidden', 'Only the person closes a topic');
  const row = requireRow(ctx, input.id);
  const at = now();
  setState(ctx, row.id, 'closed', at);
  return toTopic(ctx, requireRow(ctx, row.id), at);
}

export type TopicLinkVia = 'convert' | 'from' | 'confirmed';

export function linkTopic(
  ctx: Context,
  input: { id: string; item: string; via: TopicLinkVia },
  now = systemClock,
): Topic {
  const row = requireRow(ctx, input.id);
  const item = requireItem(ctx.db, input.item);
  const at = now();
  ctx.db
    .prepare(
      `INSERT INTO topic_links (topic_id, item_id, via, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (topic_id, item_id) DO UPDATE SET via = excluded.via, at = excluded.at`,
    )
    .run(row.id, item.id, input.via, at);
  return toTopic(ctx, requireRow(ctx, row.id), at);
}

// The person turns a topic into a task: the item, made on a board of their choice, and the topic
// point to each other, and the topic is done.
export function convertTopic(
  ctx: Context,
  input: { id: string; item: string; actor: Actor },
  now = systemClock,
): Topic {
  if (input.actor.kind !== 'human')
    refuse('forbidden', 'Only the person turns a topic into a task');
  const row = requireRow(ctx, input.id);
  const item = requireItem(ctx.db, input.item);
  const at = now();
  return transaction(ctx.db, () => {
    linkTopic(ctx, { id: row.id, item: item.id, via: 'convert' }, () => at);
    ctx.db
      .prepare("UPDATE topics SET state = 'task', task = ?, updated_at = ? WHERE id = ?")
      .run(item.id, at, row.id);
    return toTopic(ctx, requireRow(ctx, row.id), at);
  });
}

// An item is being deleted (with its board): topics lose their link to it, and a topic it was
// turned into goes back to whose turn it was, with a line in its thread naming the deleted task.
export function forgetTopicItem(ctx: Context, item: string, at: string): void {
  ctx.db.prepare('DELETE FROM topic_links WHERE item_id = ?').run(item);
  const converted = ctx.db.prepare('SELECT id FROM topics WHERE task = ?').all(item) as {
    id: string;
  }[];
  for (const { id } of converted) {
    const answered = ctx.db
      .prepare("SELECT 1 FROM topic_turns WHERE topic_id = ? AND kind = 'answer' LIMIT 1")
      .get(id);
    ctx.db
      .prepare('UPDATE topics SET state = ?, task = NULL, updated_at = ? WHERE id = ?')
      .run(answered ? 'answered' : 'open', at, id);
    addTurn(ctx, id, { kind: 'event', text: item, by: { kind: 'human', name: 'otea' } }, at);
  }
}

export function dismissTopicSuggestion(
  ctx: Context,
  input: { id: string; item: string },
  now = systemClock,
): void {
  const row = requireRow(ctx, input.id);
  const item = requireItem(ctx.db, input.item);
  ctx.db
    .prepare(
      `INSERT INTO topic_links (topic_id, item_id, via, at) VALUES (?, ?, 'dismissed', ?)
       ON CONFLICT (topic_id, item_id) DO NOTHING`,
    )
    .run(row.id, item.id, now());
}

export type ItemTopic = Topic & { pending: boolean };

const isPending = (state: TopicState) =>
  state === 'open' || state === 'answered' || state === 'hanging';

// The topics an item is linked to, each saying whether it still waits on someone.
export function topicsOfItem(ctx: Context, item: string, now = systemClock): ItemTopic[] {
  const at = now();
  const rows = ctx.db
    .prepare(
      `SELECT t.* FROM topics t JOIN topic_links l ON l.topic_id = t.id
       WHERE l.item_id = ? AND l.via <> 'dismissed' ORDER BY t.seq`,
    )
    .all(item) as TopicRow[];
  return rows.map((row) => {
    const topic = toTopic(ctx, row, at);
    return { ...topic, pending: isPending(topic.state) };
  });
}

// Open topics the item may have come from, for the person to confirm: one the same agent opened
// shortly before it made the item, or one of the same session. Never one already linked or
// dismissed for it.
export function topicSuggestions(
  ctx: Context,
  item: string,
  now = systemClock,
  session?: string,
): Topic[] {
  const record = requireItem(ctx.db, item);
  const madeAt = Date.parse(record.createdAt);
  const at = now();
  const rows = ctx.db
    .prepare(
      `SELECT t.* FROM topics t
       WHERE t.state IN ('open', 'answered')
         AND NOT EXISTS (SELECT 1 FROM topic_links l WHERE l.topic_id = t.id AND l.item_id = ?)
       ORDER BY t.seq`,
    )
    .all(record.id) as TopicRow[];
  return rows
    .filter((row) => {
      if (session && row.session === session) return true;
      if (record.createdBy.kind !== 'agent' || row.agent !== record.createdBy.name) return false;
      const opened = Date.parse(row.created_at);
      return opened <= madeAt && madeAt - opened <= SUGGEST_WITHIN_MS;
    })
    .map((row) => toTopic(ctx, row, at));
}

const ORDER: Readonly<Record<TopicState, number>> = {
  hanging: 0,
  open: 1,
  answered: 2,
  task: 3,
  closed: 4,
};

// The topics, what is left hanging first; closed ones and those turned into tasks only when asked.
export function listTopics(
  ctx: Context,
  filter: { all?: boolean } = {},
  now = systemClock,
): Topic[] {
  const at = now();
  const rows = ctx.db.prepare('SELECT * FROM topics ORDER BY seq').all() as TopicRow[];
  return rows
    .map((row) => toTopic(ctx, row, at))
    .filter((topic) => filter.all || isPending(topic.state))
    .sort(
      (a, b) =>
        ORDER[a.state] - ORDER[b.state] || a.id.localeCompare(b.id, 'en', { numeric: true }),
    );
}

export type TopicWaiting = { topic: string; note: string; text: string };

// A note the person left on a topic this agent answers, not yet delivered: otea wait wakes for it
// once, and the agent answers it with otea topic answer.
export function topicWaiting(
  ctx: Context,
  agent: string,
  now = systemClock,
): TopicWaiting | undefined {
  const row = ctx.db
    .prepare(
      `SELECT n.id, n.topic_id, n.text FROM topic_turns n JOIN topics t ON t.id = n.topic_id
       WHERE t.agent = ? AND t.state = 'open' AND n.kind = 'note' AND n.seen_at IS NULL
       ORDER BY n.id LIMIT 1`,
    )
    .get(agent) as { id: number; topic_id: string; text: string } | undefined;
  if (!row) return undefined;
  ctx.db.prepare('UPDATE topic_turns SET seen_at = ? WHERE id = ?').run(now(), row.id);
  return {
    topic: row.topic_id,
    note: row.text,
    text: `The person left a note on topic ${row.topic_id}: "${row.text}"\nAnswer it with otea topic answer ${row.topic_id} --summary "<short answer>" --full "<your full answer>".`,
  };
}

// The topics waiting for this agent's answer: its open ones, a question it recorded and has not
// answered or a note the person left (which otea wait woke it for only once), for otea next to name.
export function topicsAwaiting(ctx: Context, agent: string, now = systemClock): Topic[] {
  return listTopics(ctx, {}, now).filter(
    (topic) => topic.turn === 'agent' && topic.agent === agent,
  );
}

export function topicsAwaitingText(topics: readonly Topic[]): string | undefined {
  if (topics.length === 0) return undefined;
  return [
    'Topics waiting for your answer (the person reads it in Temas):',
    ...topics.map(
      ({ id, title }) =>
        `  ${id} "${title}": otea topic answer ${id} --summary "<short answer>" --full "<your full answer>"`,
    ),
  ].join('\n');
}

// Refuses topic work while topics are off for the project.
export function requireTopicsOn(ctx: Context): void {
  if (!topicsOn(ctx))
    throw new OteaError(
      'forbidden',
      'Topics are off for this project: the person turns them on with otea topic on, or in Settings',
    );
}

const STATE_WORDS: Readonly<Record<TopicState, string>> = {
  open: "open, the agent's turn to answer",
  hanging: 'left hanging: open and untouched for a day',
  answered: "answered, the person's turn",
  closed: 'closed',
  task: 'turned into a task',
};

// A topic as text: its state, then each turn; an answer's summary, then its full text.
export function topicText(topic: Topic): string {
  const head = `${topic.id} · ${topic.title} (${STATE_WORDS[topic.state]})`;
  const lines = [head];
  if (topic.task) lines.push(`Became ${topic.task}.`);
  if (topic.links.length > 0) lines.push(`Linked to ${topic.links.join(', ')}.`);
  if (topic.resume) lines.push(`Resume the session: ${topic.resume}`);
  for (const turn of topic.turns) {
    const who = turn.by.kind === 'human' ? 'the person' : turn.by.name;
    if (turn.kind === 'event') {
      lines.push(
        `${turn.n}. The task ${turn.text} was deleted with its board, so the topic is pending again.`,
      );
    } else if (turn.kind === 'answer') {
      const from = turn.source === 'session' ? 'read from the session' : 'copied by the agent';
      lines.push(`${turn.n}. Answer by ${who}: ${turn.text}`);
      if (turn.full) lines.push(`   Full answer (${from}):\n${turn.full.replace(/^/gm, '   ')}`);
    } else {
      const label = turn.kind === 'question' ? 'Question' : 'Note from the person';
      lines.push(`${turn.n}. ${label}: ${turn.text}`);
    }
  }
  return lines.join('\n');
}

export function topicsListText(topics: readonly Topic[]): string {
  if (topics.length === 0) return 'No topics wait on anyone.';
  return topics.map((topic) => `${topic.id}  ${topic.state.padEnd(8)}  ${topic.title}`).join('\n');
}

export type SessionAnswer = { session: string; since: string; text: string };

// The chat's answer without the lines that name the topic itself ("Lo dejé registrado en otea como
// TEM-1"): they say where the answer was kept, not what it says.
function withoutRecording(text: string, id: string): string {
  const names = new RegExp(`\\b${id}\\b`, 'i');
  return text
    .split('\n')
    .filter((line) => !names.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The answer as the agent wrote it in its chat, read from its session at the end of its turn (the
// Claude Code Stop hook): it goes to the topic the agent answered this turn, the one of this
// session, or the only one answered this turn when the agent gave no session. Nothing when it
// cannot tell which. Returns the topic it went to.
export function answerFromSession(
  ctx: Context,
  input: SessionAnswer,
  now = systemClock,
): string | undefined {
  const text = input.text.trim();
  if (text === '') return undefined;
  const rows = ctx.db
    .prepare(
      `SELECT t.* FROM topics t
       WHERE t.state = 'answered' AND t.updated_at >= ?
         AND (SELECT kind FROM topic_turns n WHERE n.topic_id = t.id ORDER BY n.id DESC LIMIT 1) = 'answer'`,
    )
    .all(input.since) as TopicRow[];
  const ofSession = rows.filter((row) => row.session === input.session);
  const unnamed = rows.filter((row) => row.session === null);
  const candidates = ofSession.length > 0 ? ofSession : unnamed;
  const [target] = candidates.length === 1 ? candidates : [];
  if (!target?.agent) return undefined;
  const full = withoutRecording(text, target.id);
  if (full === '') return undefined;
  answerTopic(
    ctx,
    {
      id: target.id,
      full,
      source: 'session',
      actor: { kind: 'agent', name: target.agent },
      session: input.session,
    },
    now,
  );
  return target.id;
}
