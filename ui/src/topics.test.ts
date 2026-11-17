import { describe, expect, it } from 'vitest';
import {
  answeredTopics,
  convertBoard,
  convertDraft,
  convertFields,
  convertReady,
  lastAnswer,
  pendingTopics,
  type Topic,
  topicGroups,
  topicOfRoute,
} from './topics.ts';
import type { FieldView, TypeView } from './types.ts';

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

describe('turning a topic into a task', () => {
  const field = (name: string, extra: Partial<FieldView> = {}): FieldView => ({
    name,
    module: 'text',
    ...extra,
  });
  const change: TypeView = {
    name: 'change',
    label: 'Change',
    initial: 'todo',
    states: [],
    layout: { header: [], evidence: [], body: [], side: [], row: [], phone: [], intake: [] },
    fields: [
      field('title', { required: 'create' }),
      field('Qué quiero', { module: 'markdown', required: 'create' }),
      field('Cómo lo valido', { required: 'complete' }),
      field('kind', { required: 'create', default: 'feature' }),
      field('notes'),
    ],
  };

  it('asks for the title and every field creating the item needs that has no default', () => {
    expect(convertFields(change).map(({ name }) => name)).toEqual(['title', 'Qué quiero']);
  });

  it('starts the title as the topic and holds the task until each such field is filled', () => {
    const draft = convertDraft(change, topic('TEM-1', 'answered'));
    expect(draft.title).toBe('TEM-1');
    expect(convertReady(change, draft)).toBe(false);
    expect(convertReady(change, { ...draft, 'Qué quiero': 'Que pase en Windows' })).toBe(true);
    expect(convertReady(change, { ...draft, title: ' ', 'Qué quiero': 'x' })).toBe(false);
  });
});

describe('the board a topic turns into a task on', () => {
  const boards = [{ name: 'Pedidos' }, { name: 'Cambios' }, { name: 'Errores' }];
  const items = [
    { id: 'CAM-1', collection: 'Cambios' },
    { id: 'ERR-2', collection: 'Errores' },
  ];

  it('is the board of the item the topic is linked to', () => {
    expect(convertBoard({ links: ['ERR-2'] }, boards, items)).toBe('Errores');
  });

  it('is left for the person to pick when the topic names no item on a board offered', () => {
    expect(convertBoard({ links: [] }, boards, items)).toBe('');
    expect(convertBoard({ links: ['OLD-9'] }, boards, items)).toBe('');
  });
});
