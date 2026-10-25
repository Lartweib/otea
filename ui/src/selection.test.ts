import { describe, expect, it } from 'vitest';
import { hashFor, idFromHash } from './selection.ts';

describe('selection', () => {
  it.each([
    ['#TASKS-2', 'TASKS-2'],
    ['#BUG%20REPORTS-1', 'BUG REPORTS-1'],
    ['#', undefined],
    ['', undefined],
  ])('reads %j as %j', (hash, id) => {
    expect(idFromHash(hash)).toBe(id);
  });

  it('ignores a malformed hash', () => {
    expect(idFromHash('#%E0%A4%A')).toBeUndefined();
  });

  it('writes an id as a hash', () => {
    expect(hashFor('TASKS-2')).toBe('#TASKS-2');
  });
});
