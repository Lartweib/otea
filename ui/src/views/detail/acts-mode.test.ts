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

  // TS-31: offline, a paired phone still shows the question it kept, to answer once the PC is back.
  it('keeps the question in view offline, and only the question', () => {
    const o = { look: 'yours' as const, canWrite: false, question: true, plan: none };
    expect(actsModeOf({ ...o, asks: true, offline: true })).toBe('qa');
    expect(actsModeOf({ ...o, offline: true })).toBe('read');
    expect(actsModeOf({ ...o, asks: true, offline: false })).toBe('read');
  });

  // P7-R3-1: an item an agent set aside offers Retomar, not the receipt of a step on its way.
  it('offers Retomar on an item an agent set aside for later, and only to who may write', () => {
    const o = { canWrite: true, question: false, plan: none, aside: true };
    expect(actsModeOf({ ...o, look: 'queued' })).toBe('aside');
    expect(actsModeOf({ ...o, look: 'waiting' })).toBe('aside');
    expect(actsModeOf({ ...o, look: 'queued', canWrite: false })).toBe('read');
    expect(actsModeOf({ ...o, look: 'queued', aside: false })).toBe('receipt');
    expect(actsModeOf({ ...o, look: 'yours' })).toBe('moves');
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
