import { describe, expect, it } from 'vitest';
import { groupByTurn, groupItems, groupings } from './sections.ts';
import type { CollectionView, Item, Turn } from './types.ts';

const item = (id: string, turn: Turn): Item => ({
  id,
  collection: 'tasks',
  type: 'item',
  title: id,
  fields: {},
  presetVersion: 1,
  state: 'todo',
  turn,
  createdAt: 't',
  updatedAt: 't',
  createdBy: { kind: 'agent', name: 'a' },
  lease: null,
});

describe('groupByTurn', () => {
  it('splits items into human, agent and closed sections in that order', () => {
    const sections = groupByTurn([item('A', 'agent'), item('B', 'human'), item('C', 'none')]);

    expect(sections.map(({ turn, title }) => [turn, title])).toEqual([
      ['human', 'Waiting for you'],
      ['agent', 'With agents'],
      ['none', 'Closed'],
    ]);
  });

  it('keeps the given order inside each section', () => {
    const [, agent] = groupByTurn([item('A', 'agent'), item('B', 'human'), item('C', 'agent')]);

    expect(agent?.items.map(({ id }) => id)).toEqual(['A', 'C']);
  });

  it('sinks the most recently closed item to the top of the closed section', () => {
    const closed = (id: string, updatedAt: string) => ({ ...item(id, 'none'), updatedAt });
    const [, , done] = groupByTurn([
      closed('A', '2026-01-01T10:00:00Z'),
      closed('B', '2026-01-03T10:00:00Z'),
      closed('C', '2026-01-02T10:00:00Z'),
    ]);

    expect(done?.items.map(({ id }) => id)).toEqual(['B', 'C', 'A']);
  });

  it('keeps empty sections', () => {
    expect(groupByTurn([]).map(({ items }) => items)).toEqual([[], [], []]);
  });
});

const typed = (id: string, turn: Turn, state: string, fields: Record<string, string> = {}) => ({
  ...item(id, turn),
  state,
  fields,
});

const bugs: CollectionView = {
  name: 'bugs',
  prefix: 'BUGS',
  preset: 'bug-triage',
  types: [
    {
      name: 'item',
      label: 'Item',
      initial: 'reported',
      states: [
        { name: 'reported', turn: 'human' },
        { name: 'fixing', turn: 'agent' },
        { name: 'fixed', turn: 'none', closes: 'done' },
      ],
      fields: [
        { name: 'title', module: 'text' },
        { name: 'area', module: 'text' },
        { name: 'severity', module: 'severity', values: ['low', 'medium', 'high', 'critical'] },
        { name: 'category', module: 'enum', values: ['crash', 'visual'] },
      ],
      layout: { header: [], evidence: [], body: [], side: [], row: [], phone: [], intake: [] },
    },
  ],
  view: { kind: 'grid', groupBy: 'turn', columns: ['id', 'title'] },
};

describe('groupItems', () => {
  const items = [
    typed('A', 'agent', 'fixing', { severity: 'low', category: 'visual' }),
    typed('B', 'human', 'reported', { severity: 'critical' }),
    typed('C', 'none', 'fixed', { severity: 'low', category: 'crash' }),
  ];
  const keys = (by: string) =>
    groupItems(items, by, bugs).map(({ key, title, turn, items }) => [
      key,
      title,
      turn ?? '-',
      items.map(({ id }) => id).join(''),
    ]);

  it('groups by turn as groupByTurn does, keyed by the turn', () => {
    expect(keys('turn')).toEqual([
      ['human', 'Waiting for you', 'human', 'B'],
      ['agent', 'With agents', 'agent', 'A'],
      ['none', 'Closed', 'none', 'C'],
    ]);
  });

  it('groups by state in workflow order and by severity from the worst, skipping empty groups', () => {
    expect(keys('state')).toEqual([
      ['reported', 'reported', '-', 'B'],
      ['fixing', 'fixing', '-', 'A'],
      ['fixed', 'fixed', '-', 'C'],
    ]);
    expect(keys('severity')).toEqual([
      ['critical', 'critical', '-', 'B'],
      ['low', 'low', '-', 'AC'],
    ]);
  });

  it('puts the items without a value last, in a group of their own', () => {
    expect(keys('category')).toEqual([
      ['crash', 'crash', '-', 'C'],
      ['visual', 'visual', '-', 'A'],
      ['', 'no category', '-', 'B'],
    ]);
  });

  it('keeps a value the preset no longer lists in a group of its own, before the empty one', () => {
    const stale = [...items, typed('D', 'human', 'reported', { category: 'audio' })];
    const groups = groupItems(stale, 'category', bugs).map(({ key }) => key);

    expect(groups).toEqual(['crash', 'visual', 'audio', '']);
  });

  it('falls back to turn for a grouping the collection does not offer', () => {
    expect(keys('area')).toEqual(keys('turn'));
  });

  it('offers turn, state, the type with several types, and the enum and severity fields', () => {
    expect(groupings(bugs)).toEqual(['turn', 'state', 'severity', 'category']);
    const [only] = bugs.types;
    if (!only) throw new Error('no type');
    const two = { ...bugs, types: [only, { ...only, name: 'impr' }] };
    expect(groupings(two)).toEqual(['turn', 'state', 'type', 'severity', 'category']);
  });
});
