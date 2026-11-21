// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_NOTE_KEY, languageNote, setLanguage, startLanguage } from './i18n.ts';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setLanguage('en');
});

const opens = (languages: string[]) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  startLanguage();
  return languageNote();
};

// TS-19: the installed app showed the note on every open (it asked es-419, the browser es-AR),
// because only a press on it remembered it. Shown once, it is seen on this device.
describe('the first-run language note', () => {
  it('shows once per device, whatever tag the next open asks for', () => {
    expect(opens(['es-419'])).toEqual({ tag: 'es-419' });
    expect(window.localStorage.getItem(LANGUAGE_NOTE_KEY)).not.toBeNull();
    expect(opens(['es-AR'])).toBeUndefined();
  });
});
