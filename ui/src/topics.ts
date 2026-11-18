import type { Topic, TopicState } from '../../src/app/topics.ts';
import { canSubmit, type FormValues, initialValues } from './intake.ts';
import type { FieldView, TypeView } from './types.ts';

// Side topics on the page (src/app/topics.ts): what the person asked an agent off the work, kept as
// a short conversation. The page lists what waits on someone, what was left hanging first; Te toca
// folds the answered ones, the person's turn, under its reviews.

export type { Topic, TopicState, TopicTurn } from '../../src/app/topics.ts';

export type TopicsView = { on: boolean; topics: Topic[] };

export type ItemTopic = Topic & { pending: boolean };
export type ItemTopics = { linked: ItemTopic[]; suggested: Topic[] };

const GROUP_ORDER: readonly TopicState[] = ['hanging', 'open', 'answered', 'task', 'closed'];

export type TopicGroup = { state: TopicState; topics: Topic[] };

// The topics in groups by state, in the order the page shows them, empty groups left out.
export function topicGroups(topics: readonly Topic[]): TopicGroup[] {
  return GROUP_ORDER.map((state) => ({
    state,
    topics: topics.filter((topic) => topic.state === state),
  })).filter(({ topics: each }) => each.length > 0);
}

// The answered topics: the person's turn, for Te toca's folded group and the rail's count.
export function answeredTopics(topics: readonly Topic[]): Topic[] {
  return topics.filter((topic) => topic.state === 'answered');
}

// Linked topics still waiting on someone, which the item's review and close mention.
export function pendingTopics(topics: readonly ItemTopic[]): ItemTopic[] {
  return topics.filter((topic) => topic.pending);
}

// The last answer of a topic, if any: its summary shows in the list.
export function lastAnswer(topic: Pick<Topic, 'turns'>) {
  return topic.turns.findLast((turn) => turn.kind === 'answer');
}

// The topic open on the topics page, from the hash: `#/topics/TEM-3`.
export function topicOfRoute(
  topic: string | undefined,
  topics: readonly Topic[],
): Topic | undefined {
  if (!topic) return undefined;
  return topics.find(({ id }) => id.toLowerCase() === topic.toLowerCase());
}

// Convertir en tarea: the form asks for the title and each field creating an item of the type needs
// that has no default (a Cambio's "Qué quiero"), so the board never refuses the task it makes.
export function convertFields({ fields }: TypeView): FieldView[] {
  return fields.filter(
    (field) =>
      field.name === 'title' || (field.required === 'create' && field.default === undefined),
  );
}

const TEXT_MODULES = new Set(['text', 'markdown']);

// What the task starts from: the person's question and, once answered, the agent's last answer.
function topicBrief(topic: Pick<Topic, 'turns'>): string {
  const question = topic.turns.find((turn) => turn.kind === 'question')?.text ?? '';
  const answer = lastAnswer(topic)?.text;
  return answer ? `${question}\n\n${answer}` : question;
}

// The form as it opens: the topic's title as the task's, and the first text the form asks for (a
// Cambio's "Qué quiero") with what the topic said; the rest as the type starts them.
export function convertDraft(type: TypeView, topic: Pick<Topic, 'title' | 'turns'>): FormValues {
  const values: FormValues = { ...initialValues(type), title: topic.title };
  const text = convertFields(type).find(
    (field) =>
      field.name !== 'title' && field.values === undefined && TEXT_MODULES.has(field.module),
  );
  if (text && values[text.name] === '') values[text.name] = topicBrief(topic);
  return values;
}

// Te toca shows a few answered topics, so they never crowd its lanes; the topics page has them all.
export const TOCA_TOPICS = 3;

export function capped<T>(topics: readonly T[]): { shown: T[]; more: number } {
  return { shown: topics.slice(0, TOCA_TOPICS), more: Math.max(0, topics.length - TOCA_TOPICS) };
}

export function convertReady(type: TypeView, values: FormValues): boolean {
  return canSubmit(type, values);
}

// The board the convert form starts on: that of the item the topic is linked to, when it is one the
// form offers; none otherwise, for the person to pick (never simply the first board).
export function convertBoard(
  topic: Pick<Topic, 'links'>,
  boards: readonly { name: string }[],
  items: readonly { id: string; collection: string }[],
): string {
  for (const id of topic.links) {
    const board = items.find((item) => item.id === id)?.collection;
    if (board !== undefined && boards.some(({ name }) => name === board)) return board;
  }
  return '';
}
