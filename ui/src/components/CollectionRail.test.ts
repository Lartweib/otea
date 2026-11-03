import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { CollectionRail } from './CollectionRail.tsx';

afterEach(() => setLanguage('en'));

const render = (names: string[], allWork: boolean) =>
  renderToStaticMarkup(
    createElement(CollectionRail, {
      entries: names.map((name) => ({ name, yours: 0, open: 1 })),
      yoursTotal: 0,
      openTotal: names.length,
      selected: allWork ? undefined : names[0],
      onSelect: () => undefined,
      allWork,
      hidden: false,
    }),
  );

describe('CollectionRail', () => {
  it('leads with All work when the project has several collections', () => {
    const html = render(['trabajo', 'bugs'], true);

    expect(html).toContain('All work');
    expect(html.indexOf('All work')).toBeLessThan(html.indexOf('trabajo'));
  });

  it('leaves All work out with a single collection', () => {
    expect(render(['trabajo'], false)).not.toContain('All work');
  });

  it('says All work in Spanish', () => {
    setLanguage('es');

    expect(render(['trabajo', 'bugs'], true)).toContain('Todo el trabajo');
  });
});
