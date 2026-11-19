import type { Context } from './context.ts';
import { type ItemHit, itemHitLines, searchItems } from './item-search.ts';
import { systemClock } from './items.ts';
import { listTopics, type Topic } from './topics.ts';

// Topics across every project on this computer (P6-R2-4): a side question is often asked in one
// project about another, so what was concluded is looked for everywhere when it is not here.

export type ProjectRef = { id: string; name: string };

// A project as the machine serves it: open, or not available (its data missing, say).
export type ServedTopics = ProjectRef & { project?: Context };

export type Elsewhere<T> = T & { project: ProjectRef };

export type TopicsEverywhere = { topics: Elsewhere<Topic>[]; items: Elsewhere<ItemHit>[] };

// The topics of every project, and with a search the items found too, each with its project: this
// project first, then the others by name. A project that cannot be read is left out.
export function topicsEverywhere(
  served: readonly ServedTopics[],
  currentId: string,
  filter: { all?: boolean; search?: string },
  now = systemClock,
): TopicsEverywhere {
  const ordered = [...served].sort(
    (a, b) =>
      Number(b.id === currentId) - Number(a.id === currentId) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  const found: TopicsEverywhere = { topics: [], items: [] };
  for (const { id, name, project } of ordered) {
    if (!project) continue;
    const ref = { id, name };
    try {
      for (const topic of listTopics(project, filter, now))
        found.topics.push({ ...topic, project: ref });
      for (const hit of searchItems(project, filter.search ?? ''))
        found.items.push({ ...hit, project: ref });
    } catch {
      // A project whose data cannot be read now is left out of the others' answer.
    }
  }
  return found;
}

const lastAnswerOf = (topic: Topic) => topic.turns.findLast((turn) => turn.kind === 'answer');

// One line per topic, its project first; a search gives each its last answer and lists the items
// found after the topics.
export function topicsEverywhereText(found: TopicsEverywhere, search?: string): string {
  const searched = search?.trim() ?? '';
  if (found.topics.length === 0 && found.items.length === 0)
    return searched === ''
      ? 'No topics wait on anyone in any project.'
      : `No topic in any project mentions "${searched}".`;
  const blocks: string[] = [];
  if (found.topics.length > 0)
    blocks.push(
      found.topics
        .map((topic) => {
          const line = `${topic.project.name}  ${topic.id}  ${topic.state.padEnd(8)}  ${topic.title}`;
          const answer = searched === '' ? undefined : lastAnswerOf(topic);
          return answer ? `${line}\n    ${answer.text}` : line;
        })
        .join('\n'),
    );
  if (found.items.length > 0)
    blocks.push(
      [
        "In the items' threads (otea show <id>, in that project):",
        ...found.items.flatMap((hit) =>
          itemHitLines(hit, `${hit.project.name}  ${hit.id}  ${hit.title}`),
        ),
      ].join('\n'),
    );
  if (found.topics.length > 0)
    blocks.push('Read one with otea topic show <id> --project <project>.');
  return blocks.join('\n\n');
}
