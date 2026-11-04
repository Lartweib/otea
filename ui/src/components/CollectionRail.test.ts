import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { CollectionRail, type SidebarEntry } from './CollectionRail.tsx';

afterEach(() => setLanguage('en'));

const entries = (names: string[]): SidebarEntry[] =>
  names.map((name) => ({ name, yours: 0, open: 1, icon: undefined }));

const render = (
  list: SidebarEntry[],
  allWork: boolean,
  o: { folded?: boolean; onCreate?: () => void; lan?: boolean } = {},
) =>
  renderToStaticMarkup(
    createElement(CollectionRail, {
      entries: list,
      yoursTotal: 0,
      openTotal: list.length,
      selected: allWork ? undefined : list[0]?.name,
      onSelect: () => undefined,
      allWork,
      folded: o.folded ?? false,
      onCreate: o.onCreate,
      lan: o.lan,
    }),
  );

describe('CollectionRail', () => {
  it('shows Phone access in the project section only when it is given', () => {
    const shown = render(entries(['trabajo']), false, { lan: true });

    expect(shown).toContain('href="#/lan"');
    expect(shown).toContain('aria-current="page"');
    expect(shown.indexOf('Modules')).toBeLessThan(shown.indexOf('Phone access'));
    expect(render(entries(['trabajo']), false)).not.toContain('Phone access');
  });

  it('leads with All work when the project has several collections', () => {
    const html = render(entries(['trabajo', 'bugs']), true);

    expect(html).toContain('All work');
    expect(html.indexOf('All work')).toBeLessThan(html.indexOf('trabajo'));
  });

  it('leaves All work out with a single collection', () => {
    expect(render(entries(['trabajo']), false)).not.toContain('All work');
  });

  it('says All work in Spanish', () => {
    setLanguage('es');

    expect(render(entries(['trabajo', 'bugs']), true)).toContain('Todo el trabajo');
  });

  it('draws each collection’s icon, or its monogram when it has none', () => {
    const html = render(
      [
        { name: 'bugs', yours: 0, open: 1, icon: 'bug' },
        { name: 'notes', yours: 0, open: 1, icon: undefined },
      ],
      true,
    );

    expect(html).toContain('class="type-icon"');
    expect(html).toContain('>No</span>');
  });

  it('marks the second collection with the same icon with its letter', () => {
    const html = render(
      [
        { name: 'bugs', yours: 0, open: 1, icon: 'bug' },
        { name: 'bugs-mobile', yours: 0, open: 1, icon: 'bug', badge: 'm' },
      ],
      true,
    );

    expect(html.match(/class="place-badge"/g)).toHaveLength(1);
  });

  it('offers a "+" per collection only to a browser that can write, and not while folded', () => {
    const list = entries(['trabajo', 'bugs']);
    const create = () => undefined;

    expect(render(list, true)).not.toContain('New item in');
    expect(render(list, true, { onCreate: create })).toContain('aria-label="New item in bugs"');
    expect(render(list, true, { onCreate: create, folded: true })).not.toContain('New item in');
  });

  it('keeps the module catalog among the project’s places', () => {
    expect(render(entries(['trabajo']), false)).toContain('href="#/modules"');
  });
});
