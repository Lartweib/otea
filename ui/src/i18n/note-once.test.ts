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

// TS-19 again: offline cold starts of the installed app showed it every time, with "seen" kept in
// localStorage. A page its service worker controls was opened on this device before (the worker
// installs on the first open and controls only the next ones): it is never a first run.
describe('the language note on a later open', () => {
  it('stays away from a page the service worker serves, whatever storage says', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: {} },
      configurable: true,
    });
    try {
      expect(opens(['es-419'])).toBeUndefined();
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('stays away when this browser keeps nothing, rather than showing on every open', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    expect(opens(['es-419'])).toBeUndefined();
  });
});
