import { describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { actsModeOf, freeAnswerLabel } from './Acts.tsx';

const none = { primary: null, quiet: [], close: [] };

describe('what stands for the moves', () => {
  it('answers an agent’s question (otea ask) in place, though no move sends it back', () => {
    const o = { look: 'yours' as const, canWrite: true, question: true, plan: none };
    expect(actsModeOf({ ...o, asks: true })).toBe('qa');
    expect(actsModeOf(o)).toBe('moves');
    expect(actsModeOf({ ...o, asks: true, canWrite: false })).toBe('read');
  });
});

describe('the box to answer a question in', () => {
  it('says Or only after the options it is an alternative to', () => {
    setLanguage('es');
    expect(freeAnswerLabel(true)).toBe('O respóndele con tus palabras');
    expect(freeAnswerLabel(false)).toBe('Tu respuesta');
    setLanguage('en');
    expect(freeAnswerLabel(false)).toBe('Your answer');
  });
});
