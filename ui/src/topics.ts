import type { ItemHit, ItemSaid } from '../../src/app/item-search.ts';
import type { Topic, TopicState } from '../../src/app/topics.ts';
import { t } from './i18n/i18n.ts';
import { canSubmit, type FormValues, initialValues } from './intake.ts';
import type { FieldView, TypeView } from './types.ts';

// Side topics on the page (src/app/topics.ts): what the person asked an agent off the work, kept as
// a short conversation. The page lists what waits on someone, what was left hanging first; Te toca
// folds the answered ones, the person's turn, under its reviews.

export type { ItemHit, ItemSaid } from '../../src/app/item-search.ts';
export type { Topic, TopicState, TopicTurn } from '../../src/app/topics.ts';

// A search over every project gives each topic and item its project (src/app/topics-everywhere.ts).
export type ProjectRef = { id: string; name: string };
export type FoundTopic = Topic & { project?: ProjectRef };
export type FoundItem = ItemHit & { project?: ProjectRef };

// `items`: the items whose threads hold the words searched (none without a search).
export type TopicsView = {
  on: boolean;
  topics: FoundTopic[];
  items?: FoundItem[];
};

// The project a topic or item found belongs to, when it is not the page's own: it opens there.
export function elsewhere(
  found: { id: string; project?: ProjectRef },
  current: string | undefined,
): ProjectRef | undefined {
  return found.project && found.project.id !== current ? found.project : undefined;
}

// What an entry of an item found is and who said it, as the page names it before its words: the
// person reads «Tu respuesta», «Nota de entrega de quill» (P3C-R3-13). Null for the item's own
// words, its title or a field, and for an entry of no known kind.
export function saidWho({ kind, by, via }: ItemSaid): string | null {
  if (kind === 'answer') return t(via ? 'topics.items.said.answerVia' : 'topics.items.said.answer');
  if (kind === 'item' || kind === 'other') return null;
  return t(`topics.items.said.${kind}`, { agent: by });
}

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

// The last answer of a topic, if any.
export function lastAnswer(topic: Pick<Topic, 'turns'>) {
  return topic.turns.findLast((turn) => turn.kind === 'answer');
}

// A topic's own conclusion, what its line in a list says: the last answer to its own question,
// before any follow-up asked on it (otea topic add --to), which has its answer apart (P4-R3-12).
export function conclusionOf(topic: Pick<Topic, 'turns'>) {
  const first = topic.turns.findIndex((turn) => turn.kind === 'question');
  const next = topic.turns.findIndex((turn, i) => i > first && turn.kind === 'question');
  const own = next < 0 ? topic.turns : topic.turns.slice(0, next);
  return own.findLast((turn) => turn.kind === 'answer');
}

// How many follow-up questions were asked on a topic after its own.
export function followUpsOf(topic: Pick<Topic, 'turns'>): number {
  return Math.max(0, topic.turns.filter((turn) => turn.kind === 'question').length - 1);
}

// The topic open on the topics page, from the hash: `#/topics/TEM-3`. Never another project's,
// which opens on that project's page.
export function topicOfRoute<T extends FoundTopic>(
  topic: string | undefined,
  topics: readonly T[],
  current?: string,
): T | undefined {
  if (!topic) return undefined;
  return topics.find(
    (each) => each.id.toLowerCase() === topic.toLowerCase() && !elsewhere(each, current),
  );
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
