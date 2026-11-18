import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { pickNoteText, pickOf } from './blind-pick.ts';

afterEach(() => setLanguage('en'));

const note = (n: number, text: string, evidence: number) => ({
  note: n,
  text,
  at: '2026-01-01T00:00:00Z',
  by: 'you',
  step: 's',
  stepName: 'Crear',
  round: 1,
  delivered: { done: 0, of: 0 },
  anchor: { evidence, filename: 'x.png' },
});

describe('a pick on a blind compare', () => {
  it('is a comment on the file picked, in either language', () => {
    expect(pickNoteText('A')).toBe('I pick A.');
    setLanguage('es');
    expect(pickNoteText('B')).toBe('Me quedo con B.');
    const left = [note(1, 'La hoja', 7), note(2, 'Me quedo con B.', 8), note(3, 'I pick A.', 9)];
    expect(pickOf(left, [7, 8], () => true)?.note).toBe(2);
    expect(pickOf(left, [7, 8], () => false)).toBeUndefined();
    expect(pickOf(left, [7], () => true)).toBeUndefined();
  });
});
