import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage, tx } from '../../i18n/i18n.ts';

// Studio changes boards only from this computer's signed-in browser (session.ts canConfigure). A
// browser that is not signed in, or a paired device, only looks: the note says how to get editing.
afterEach(() => setLanguage('en'));

const note = () =>
  renderToStaticMarkup(
    createElement(
      'p',
      null,
      tx('bs.home.readOnly', { command: createElement('code', null, 'otea open') }),
    ),
  );

describe('Studio’s read-only note', () => {
  it('names the command that opens Otea signed in, in both languages', () => {
    for (const lang of ['es', 'en'] as const) {
      setLanguage(lang);
      expect(note()).toContain('<code>otea open</code>');
    }
  });

  it('says the boards can be looked at here, and how to edit them', () => {
    setLanguage('en');
    expect(note()).toMatch(/look at the boards/);
    expect(note()).toMatch(/To edit them, run <code>otea open<\/code>/);
    setLanguage('es');
    expect(note()).toMatch(/mirar los tableros/);
    expect(note()).toMatch(/Para editarlos, ejecuta <code>otea open<\/code>/);
  });
});
