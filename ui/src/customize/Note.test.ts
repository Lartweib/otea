import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { Note } from './Note.tsx';

afterEach(() => setLanguage('en'));

// The builder's note sits in the free column under its switches, so it never covers what was just
// placed; it wears the toast's grammar: the line, the surface, the words in serif and Deshacer.
describe('the builder’s note', () => {
  it('unrolls with its words and Deshacer when the change can be taken back', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      createElement(Note, { note: { text: 'Gravedad movido', undo: () => {}, seq: 3 } }),
    );
    expect(html).toContain('class="pop e-top st-unroll cz-note" role="status"');
    expect(html).toContain('Gravedad movido');
    expect(html).toMatch(/<button type="button" class="btn quiet sm"[^>]*>Deshacer<\/button>/);
  });

  it('has no Deshacer for a note that only tells', () => {
    const html = renderToStaticMarkup(
      createElement(Note, { note: { text: 'The title is fixed', seq: 1 } }),
    );
    expect(html).not.toContain('<button');
  });

  it('draws nothing while there is no note', () => {
    expect(renderToStaticMarkup(createElement(Note, { note: undefined }))).toBe('');
  });
});
