import { describe, expect, it } from 'vitest';
import { type Depth, observe, startHistory } from './workspace.ts';

const d = (undo: number, redo = 0): Depth => ({ undo, redo });

describe('one history across both boards', () => {
  it('lines up the edits of both boards in the order they were made', () => {
    let h = startHistory(d(0), d(0));
    h = observe(h, 'parent', d(1));
    h = observe(h, 'child', d(1));
    h = observe(h, 'parent', d(2));
    expect(h.undo).toEqual(['parent', 'child', 'parent']);
    expect(h.undo.at(-1)).toBe('parent');
  });

  it('an undo of the other board comes off the history, and its redo goes on top', () => {
    let h = startHistory(d(0), d(0));
    h = observe(h, 'parent', d(1));
    h = observe(h, 'child', d(1));
    // Deshacer: the last edit was the child's, so the child undoes it.
    h = observe(h, 'child', d(0, 1));
    expect(h.undo).toEqual(['parent']);
    expect(h.redo).toEqual(['child']);
    h = observe(h, 'parent', d(0, 1));
    expect(h.undo).toEqual([]);
    expect(h.redo).toEqual(['child', 'parent']);
    // Rehacer: the parent first, then the child.
    h = observe(h, 'parent', d(1, 0));
    expect(h.undo).toEqual(['parent']);
    expect(h.redo).toEqual(['child']);
  });

  it('a new edit anywhere clears what could be redone', () => {
    let h = startHistory(d(0), d(0));
    h = observe(h, 'child', d(1));
    h = observe(h, 'child', d(0, 1));
    h = observe(h, 'parent', d(1));
    expect(h.undo).toEqual(['parent']);
    expect(h.redo).toEqual([]);
  });

  it('a typing burst that only clears its own redo leaves the history in order', () => {
    let h = startHistory(d(0), d(0));
    h = observe(h, 'parent', d(2));
    h = observe(h, 'parent', d(1, 1));
    h = observe(h, 'parent', d(1, 0));
    expect(h.undo).toEqual(['parent']);
    expect(h.redo).toEqual([]);
  });

  it('a board read again (after publishing) leaves the history of the other one', () => {
    let h = startHistory(d(0), d(0));
    h = observe(h, 'parent', d(1));
    h = observe(h, 'child', d(1));
    h = observe(h, 'parent', d(0, 0));
    expect(h.undo).toEqual(['child']);
  });

  it('starts from what each board could already undo', () => {
    const h = startHistory(d(2), d(1));
    expect(h.undo).toEqual(['parent', 'parent', 'child']);
  });
});
