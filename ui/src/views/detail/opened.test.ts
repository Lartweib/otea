import { describe, expect, it } from 'vitest';
import { openedFor, withHeard, withOpened } from './opened.ts';

describe('the files opened in the reader, as the page keeps them', () => {
  it('adds a file opened here at once, and keeps it while the PC has not said it back', () => {
    const opened = withOpened({ item: 'EXP-1', ids: new Set([1]) }, 'EXP-1', 2);
    expect([...openedFor(opened, 'EXP-1')]).toEqual([1, 2]);
    const heard = withHeard(opened, 'EXP-1', [1, 5]);
    expect([...openedFor(heard, 'EXP-1')].sort()).toEqual([1, 2, 5]);
  });

  it('never carries one item’s files to another', () => {
    const opened = withOpened({ item: 'EXP-1', ids: new Set([1]) }, 'EXP-2', 7);
    expect([...openedFor(opened, 'EXP-2')]).toEqual([7]);
    expect([...openedFor(opened, 'EXP-1')]).toEqual([]);
    expect([...openedFor(withHeard(opened, 'EXP-1', [3]), 'EXP-2')]).toEqual([]);
  });
});
