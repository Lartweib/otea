import { describe, expect, it } from 'vitest';
import { actsModeOf } from './Acts.tsx';

const none = { primary: null, quiet: [], close: [] };

describe('what stands for the moves', () => {
  it('answers an agent’s question (otea ask) in place, though no move sends it back', () => {
    const o = { look: 'yours' as const, canWrite: true, question: true, plan: none };
    expect(actsModeOf({ ...o, asks: true })).toBe('qa');
    expect(actsModeOf(o)).toBe('moves');
    expect(actsModeOf({ ...o, asks: true, canWrite: false })).toBe('read');
  });
});
