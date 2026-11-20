import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../../src/core/notify/planner.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { notifySummary } from './summary.ts';

afterEach(() => setLanguage('en'));

// The device list on the desk (Emparejar un teléfono): what each paired device is told, in a line.
describe('notifySummary', () => {
  it('says a device without notifications is told nothing', () => {
    setLanguage('es');
    expect(notifySummary(null)).toBe('Avisos apagados');
    setLanguage('en');
    expect(notifySummary(null)).toBe('Notifications off');
  });

  it('names the kinds on, in the order Preferencias shows them', () => {
    setLanguage('es');
    expect(notifySummary(DEFAULT_PREFS)).toBe(
      'Avisos: revisiones · preguntas · respuestas · atascos',
    );
    setLanguage('en');
    expect(notifySummary({ ...DEFAULT_PREFS, replied: false, aside: true })).toBe(
      'Notifications: reviews · questions · stuck items · set aside',
    );
  });

  it('adds the quiet hours and how many projects are muted', () => {
    setLanguage('es');
    const prefs = {
      ...DEFAULT_PREFS,
      ask: false,
      replied: false,
      stuck: false,
      quiet: { from: '22:00', to: '08:00' },
      muted: ['a', 'b'],
    };
    expect(notifySummary(prefs)).toBe(
      'Avisos: revisiones · silencio 22:00–08:00 · 2 proyectos silenciados',
    );
    setLanguage('en');
    expect(notifySummary({ ...prefs, muted: ['a'] })).toBe(
      'Notifications: reviews · quiet 22:00–08:00 · 1 project muted',
    );
  });

  it('says when every kind is off though notifications are on', () => {
    const none = { ...DEFAULT_PREFS, turn: false, ask: false, replied: false, stuck: false };
    expect(notifySummary(none)).toBe('Notifications on, every kind off');
    setLanguage('es');
    expect(notifySummary(none)).toBe('Avisos activados, pero ningún tipo elegido');
  });
});
