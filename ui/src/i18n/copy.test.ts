import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage, t } from './i18n.ts';

afterEach(() => setLanguage('en'));

// The words one thing goes by, the same wherever it shows, in each language.
describe('the copy says one thing one way', () => {
  it('says a span of hours with its minutes as minutes', () => {
    setLanguage('es');
    expect(t('when.left', { time: t('when.hoursMinutes', { hours: 2, minutes: 59 }) })).toBe(
      'quedan 2 h 59 min',
    );
    setLanguage('en');
    expect(t('when.hoursMinutes', { hours: 2, minutes: 59 })).toBe('2 h 59 min');
  });

  it('says an attachment in Actividad as the history does, and a handoff with its step', () => {
    setLanguage('es');
    expect(t('event.attached', { file: 'fix.diff' })).toBe('Adjuntó fix.diff');
    expect(t('activity.attached', { file: 'fix.diff', id: 'BUG-1' })).toBe(
      'adjuntó fix.diff a BUG-1',
    );
    expect(t('activity.attachedYou', { file: 'fix.diff', id: 'BUG-1' })).toBe(
      'Adjuntaste fix.diff a BUG-1',
    );
    expect(t('activity.handed', { id: 'BUG-1', state: 'Triar' })).toBe('te pasó BUG-1 en Triar');
    setLanguage('en');
    expect(t('activity.attached', { file: 'fix.diff', id: 'BUG-1' })).toBe(
      'attached fix.diff to BUG-1',
    );
    expect(t('activity.attachedYou', { file: 'fix.diff', id: 'BUG-1' })).toBe(
      'You attached fix.diff to BUG-1',
    );
    expect(t('activity.handed', { id: 'BUG-1', state: 'Triage' })).toBe(
      'handed you BUG-1 in Triage',
    );
  });

  it('names who handed an item over the same way in Te toca and in Proyectos', () => {
    setLanguage('en');
    expect(t('projects.sub.hands', { agent: 'kiln' })).toBe(t('toca.sub.hands', { agent: 'kiln' }));
    expect(t('toca.sub.hands', { agent: 'kiln' })).toBe('handed over by kiln');
    setLanguage('es');
    expect(t('projects.sub.hands', { agent: 'kiln' })).toBe(t('toca.sub.hands', { agent: 'kiln' }));
  });

  it('says an empty Atasco plainly', () => {
    setLanguage('es');
    expect(t('toca.dekStuck.none')).toBe('Nada parado: los agentes siguen dando señales.');
    setLanguage('en');
    expect(t('toca.dekStuck.none')).toBe('Nothing stuck: the agents keep checking in.');
  });

  it('writes a published version one way in the editor’s badge, its pair and the home', () => {
    for (const lang of ['es', 'en'] as const) {
      setLanguage(lang);
      const chip = t('bs.editor.chip.live', { v: 3 });
      expect(t('bs.editor.pair.live', { v: 3 })).toBe(chip.toLowerCase());
      expect(t('bs.home.live', { version: 3 })).toBe(chip.toLowerCase());
    }
    setLanguage('es');
    expect(t('bs.editor.pair.live', { v: 3 })).toBe('publicado · v3');
  });

  it('calls the editor’s discard "Descartar cambios", apart from discarding an item', () => {
    setLanguage('es');
    expect(t('bs.editor.discard')).toBe('Descartar cambios');
    expect(t('bs.preview.discard.label')).toBe('Descartar cambios');
    expect(t('bi.drop.ok')).toBe('Descartar');
    setLanguage('en');
    expect(t('bs.editor.discard')).toBe('Discard changes');
    expect(t('bs.preview.discard.label')).toBe('Discard changes');
  });

  it('says what Otea writes into the repos without a forced turn of phrase', () => {
    setLanguage('es');
    expect(t('settings.gate')).toBe('control');
    expect(t('settings.reposNote', { agents: 'AGENTS.md' })).toBe(
      'Otea solo escribe en tus repositorios AGENTS.md, y un hook donde el control es estricto.',
    );
    expect(t('settings.notChecked')).toBe('sin comprobar hasta que vuelva a aparecer');
    setLanguage('en');
    expect(t('settings.reposNote', { agents: 'AGENTS.md' })).toBe(
      'Otea writes only AGENTS.md into your repos, and a hook where the gate is hard.',
    );
  });
});
