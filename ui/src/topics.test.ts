import { describe, expect, it } from 'vitest';
import {
  answeredTopics,
  lastAnswer,
  pendingTopics,
  type Topic,
  topicGroups,
  topicOfRoute,
} from './topics.ts';

const topic = (id: string, state: Topic['state'], answers: string[] = []): Topic => ({
  id,
  title: id,
  state,
  turn: state === 'answered' ? 'human' : 'agent',
  createdAt: '2026-11-17T10:00:00.000Z',
  updatedAt: '2026-11-17T10:00:00.000Z',
  by: { kind: 'agent', name: 'quill' },
  turns: [
    { n: 1, kind: 'question', text: 'q', by: { kind: 'agent', name: 'quill' }, at: '' },
    ...answers.map((text, index) => ({
      n: index + 2,
      kind: 'answer' as const,
      text,
      by: { kind: 'agent' as const, name: 'quill' },
      at: '',
    })),
  ],
  links: [],
});

describe('topics on the page', () => {
  it('groups them by state, what was left hanging first, empty groups left out', () => {
    const groups = topicGroups([
      topic('TEM-3', 'answered'),
      topic('TEM-1', 'hanging'),
      topic('TEM-2', 'open'),
    ]);
    expect(groups.map(({ state }) => state)).toEqual(['hanging', 'open', 'answered']);
  });

  it('picks the answered ones, the person turn', () => {
    expect(
      answeredTopics([topic('TEM-1', 'open'), topic('TEM-2', 'answered')]).map(({ id }) => id),
    ).toEqual(['TEM-2']);
  });

  it('keeps the linked topics that still wait on someone', () => {
    expect(
      pendingTopics([
        { ...topic('TEM-1', 'open'), pending: true },
        { ...topic('TEM-2', 'closed'), pending: false },
      ]).map(({ id }) => id),
    ).toEqual(['TEM-1']);
  });

  it('reads the last answer, and the topic a route opens', () => {
    expect(lastAnswer(topic('TEM-1', 'answered', ['a', 'b']))?.text).toBe('b');
    expect(lastAnswer(topic('TEM-1', 'open'))).toBeUndefined();
    expect(topicOfRoute('tem-2', [topic('TEM-2', 'open')])?.id).toBe('TEM-2');
    expect(topicOfRoute(undefined, [topic('TEM-2', 'open')])).toBeUndefined();
  });
});
