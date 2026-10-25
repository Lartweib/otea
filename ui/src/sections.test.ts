import { describe, expect, it } from 'vitest';
import { groupByTurn } from './sections.ts';
import type { Item, Turn } from './types.ts';

const item = (id: string, turn: Turn): Item => ({
  id,
  collection: 'tasks',
  title: id,
  body: '',
  state: 'todo',
  turn,
  createdAt: 't',
  updatedAt: 't',
  createdBy: { kind: 'agent', name: 'a' },
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

  it('keeps empty sections', () => {
    expect(groupByTurn([]).map(({ items }) => items)).toEqual([[], [], []]);
  });
});
