import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { item } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { FoldButton } from './rows.tsx';

afterEach(() => setLanguage('en'));

const fold = (open: boolean) =>
  renderToStaticMarkup(
    createElement(FoldButton, { item: item({ id: 'TAR-1' }), n: 2, open, onFold: () => {} }),
  );
const said = (html: string) => html.replace(/<[^>]+>/g, '').trim();

describe('the fold on a parent row', () => {
  it('says how many are inside, with no sign that reads as a subtraction', () => {
    setLanguage('es');
    expect(said(fold(true))).toBe('2 dentro');
    expect(said(fold(false))).toBe('2 dentro');
    setLanguage('en');
    expect(said(fold(true))).toBe('2 inside');
  });

  it('shows open or folded by its chevron and aria-expanded', () => {
    expect(fold(true)).toContain('aria-expanded="true"');
    expect(fold(false)).toContain('aria-expanded="false"');
    expect(fold(true)).toContain('class="fg"');
  });
});
