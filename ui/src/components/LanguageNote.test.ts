import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { LanguageNote, LanguageNoteView } from './LanguageNote.tsx';

afterEach(() => setLanguage('en'));

describe('the first-run language note', () => {
  it('says in Spanish where the language came from and that only the interface is translated', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      createElement(LanguageNoteView, { tag: 'es-AR', onDismiss: () => {} }),
    );

    expect(html).toContain('Otea está en español, como pide tu navegador (<code>es-AR</code>).');
    expect(html).toContain('Solo se traduce la interfaz.');
    expect(html).toContain('lo que escriben los agentes, quedan tal como se escribieron');
    expect(html).toContain('>Entendido</button>');
    expect(html).toContain('aria-label="Idioma"');
  });

  it('names Preferences where it is: just below on the sidebar, at the panel’s foot on a phone', () => {
    setLanguage('es');
    const view = (anchored: boolean) =>
      renderToStaticMarkup(
        createElement(LanguageNoteView, { tag: 'es-AR', onDismiss: () => {}, anchored }),
      );

    expect(view(true)).toContain('en Preferencias, aquí abajo.');
    expect(view(false)).toContain('en Preferencias, al pie del panel.');
  });

  it('draws nothing when no note is due', () => {
    expect(renderToStaticMarkup(createElement(LanguageNote))).toBe('');
  });
});
