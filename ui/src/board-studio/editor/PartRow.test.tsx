import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { removedSays } from './PartRow.tsx';

afterEach(() => setLanguage('en'));

const said = (at: Parameters<typeof removedSays>[1]) =>
  renderToStaticMarkup(removedSays('Rama', at, tareasDeRepo()));

// P7-R3-4: Quitar on a part of the form said «Quitaste Rama de el formulario».
describe('the toast once a part is removed', () => {
  it('says «del formulario» for the form, and the step by its name', () => {
    setLanguage('es');
    expect(said({ type: 'form' })).toBe('Quitaste <b>Rama</b> del formulario.');
    expect(said({ type: 'step', step: 'simpl' })).toBe(
      'Quitaste <b>Rama</b> de <b>Implementar</b>.',
    );
    setLanguage('en');
    expect(said({ type: 'form' })).toBe('You removed <b>Rama</b> from the form.');
    expect(said({ type: 'step', step: 'simpl' })).toBe(
      'You removed <b>Rama</b> from <b>Implementar</b>.',
    );
  });
});
