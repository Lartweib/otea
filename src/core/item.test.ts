import { describe, expect, it } from 'vitest';
import { formatItemId, parseItemId, prefixFor } from './item.ts';

describe('prefixFor', () => {
  it.each([
    ['tasks', 'TASKS'],
    ['bug-reports', 'BUGREPORTS'],
    ['Q3 reviews!', 'Q3REVIEWS'],
  ])('derives %s -> %s', (name, prefix) => {
    expect(prefixFor(name)).toBe(prefix);
  });

  it('fails with invalid_name when nothing alphanumeric remains', () => {
    expect(() => prefixFor('--')).toThrow(expect.objectContaining({ code: 'invalid_name' }));
  });
});

describe('item ids', () => {
  it('formats prefix and sequence', () => {
    expect(formatItemId('TASKS', 7)).toBe('TASKS-7');
  });

  it('parses an id back', () => {
    expect(parseItemId('TASKS-7')).toEqual({ prefix: 'TASKS', seq: 7 });
  });

  it.each(['TASKS', 'tasks-1', 'TASKS-', 'TASKS-0', 'TASKS-01', 'TA-SKS-1'])(
    'rejects %s with invalid_id',
    (id) => {
      expect(() => parseItemId(id)).toThrow(expect.objectContaining({ code: 'invalid_id' }));
    },
  );
});
