import { describe, expect, it } from 'vitest';
import { draftKeyOf, dropDraft, keepDraft, readDraft } from './note-draft.ts';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
};

const broken = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

// The send-back's words were gone after a reload (P4-R2-9): the draft stays on this browser until
// it is sent, per item and per move.
describe('a send-back draft', () => {
  it('is kept per item and move, read back, and dropped once sent or emptied', () => {
    const store = memory();
    const key = draftKeyOf('PRO-1', 'sdo');
    expect(readDraft(store, key)).toBe('');
    keepDraft(store, key, 'Más aire arriba');
    expect(readDraft(store, key)).toBe('Más aire arriba');
    expect(readDraft(store, draftKeyOf('PRO-2', 'sdo'))).toBe('');
    keepDraft(store, key, '   ');
    expect(store.data.has(key)).toBe(false);
    keepDraft(store, key, 'otra vez');
    dropDraft(store, key);
    expect(readDraft(store, key)).toBe('');
  });

  it('does without storage when the browser refuses it', () => {
    expect(readDraft(broken, 'k')).toBe('');
    expect(() => keepDraft(broken, 'k', 'x')).not.toThrow();
    expect(() => dropDraft(broken, 'k')).not.toThrow();
    expect(readDraft(undefined, 'k')).toBe('');
  });
});
