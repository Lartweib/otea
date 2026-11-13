import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { sentenceNode } from './SentenceText.tsx';
import { summary } from './sentences.ts';

afterEach(() => setLanguage('en'));

const html = (select?: () => void) =>
  summary(creatures())
    .map((s) => renderToStaticMarkup(<>{sentenceNode(s, select)}</>))
    .join(' ');

describe('the summary under the board’s name', () => {
  it('sets the board’s words apart as plain marks when nothing can be selected', () => {
    expect(html()).toContain('<b>Concepto</b>');
    expect(html()).not.toContain('<button');
  });

  it('makes each step and Hecho a button that selects its card', () => {
    setLanguage('es');
    const out = html(() => undefined);
    for (const name of ['Concepto', 'Animar', 'Pulir', 'Hecho'])
      expect(out).toMatch(
        new RegExp(`<button type="button" class="se-namelink"[^>]*>${name}</button>`),
      );
    // Parts are not cards of their own here: they stay marks.
    expect(out).toContain('<b>Arte conceptual</b>');
  });
});
