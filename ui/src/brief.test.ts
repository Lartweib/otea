import { describe, expect, it } from 'vitest';
import { type BriefEntry, briefFileName, reorder, toggleIn } from './brief.ts';

const entry = (id: string, after: string[] = []): BriefEntry => ({
  id,
  title: id,
  after,
  missing: [],
});

describe('reorder', () => {
  const order = [entry('TASK-3'), entry('BUGS-17', ['TASK-3']), entry('BUGS-14')];

  it('swaps an item with its neighbour', () => {
    expect(reorder(order, 'BUGS-14', -1)).toEqual({ ids: ['TASK-3', 'BUGS-14', 'BUGS-17'] });
    expect(reorder(order, 'TASK-3', -1)).toEqual({ ids: ['TASK-3', 'BUGS-17', 'BUGS-14'] });
  });

  it('holds an item that would pass what blocks it, either way', () => {
    expect(reorder(order, 'BUGS-17', -1)).toEqual({ held: { id: 'BUGS-17', needs: 'TASK-3' } });
    expect(reorder(order, 'TASK-3', 1)).toEqual({ held: { id: 'BUGS-17', needs: 'TASK-3' } });
  });
});

describe('toggleIn', () => {
  it('takes an item out below the line and puts it back at the end', () => {
    expect(toggleIn(['A', 'B'], [], 'A')).toEqual({ inBrief: ['B'], left: ['A'] });
    expect(toggleIn(['B'], ['A'], 'A')).toEqual({ inBrief: ['B', 'A'], left: [] });
  });
});

describe('briefFileName', () => {
  it('names the file after the first items', () => {
    expect(briefFileName(['WORK-2', 'BUGS-1'])).toBe('brief-work-2-bugs-1.md');
    expect(briefFileName(['A-1', 'A-2', 'A-3', 'A-4', 'A-5'])).toBe(
      'brief-a-1-a-2-a-3-and-2-more.md',
    );
  });
});
