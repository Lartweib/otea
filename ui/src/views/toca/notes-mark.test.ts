import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { notesMark } from './blocks.tsx';

afterEach(() => setLanguage('en'));

describe('Te toca: a light mark for the notes of a round', () => {
  it('says how many still wait for the agent', () => {
    setLanguage('es');
    expect(notesMark({ count: 3, unanswered: 1 })).toBe('1 sin respuesta');
  });

  it('says the agent answered, once nothing waits', () => {
    setLanguage('es');
    const replied = { note: 2, by: 'claude-d', at: '2026-11-13T14:22:00Z' };
    expect(notesMark({ count: 2, unanswered: 0, replied })).toBe('claude-d contestó');
    setLanguage('en');
    expect(notesMark({ count: 2, unanswered: 0, replied })).toBe('claude-d answered');
  });

  it('says nothing for notes nobody answered yet and none waiting', () => {
    expect(notesMark({ count: 0, unanswered: 0 })).toBeNull();
  });
});
