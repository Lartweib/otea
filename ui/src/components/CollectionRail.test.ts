import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { CollectionRail, type SidebarEntry } from './CollectionRail.tsx';
import type { StudioTree } from './StudioTree.tsx';

afterEach(() => setLanguage('en'));

const entries = (names: string[]): SidebarEntry[] =>
  names.map((name) => ({ name, yours: 0, open: 1, icon: undefined }));

type Options = {
  folded?: boolean;
  onCreate?: () => void;
  onToggle?: () => void;
  studio?: boolean;
  modules?: boolean;
  tree?: StudioTree;
  variant?: 'sidebar' | 'panel';
};

const render = (list: SidebarEntry[], allWork: boolean, o: Options = {}) =>
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
      onToggle: o.onToggle,
      studio: o.studio ?? false,
      modules: o.modules ?? false,
      studioTree: o.tree,
      variant: o.variant ?? 'sidebar',
      foot: createElement('span', { className: 'test-foot' }, 'Preferences'),
    }),
  );

const tree: StudioTree = {
  blueprint: { name: 'game-studio', version: 1, boards: 3 },
  presets: [
    { name: 'tasks', version: 2, collections: ['work'], official: true },
    { name: 'game-bugs', version: 3, collections: ['bugs'], official: false },
  ],
  modules: 15,
  current: { kind: 'preset', name: 'game-bugs' },
};

// The anchor that leads to `href`, as rendered.
const anchor = (html: string, href: string) =>
  html.match(new RegExp(`<a[^>]*href="${href.replaceAll('/', '\\/')}"[^>]*>`))?.[0] ?? '';

describe('CollectionRail', () => {
  it('puts the fold toggle at the top, in front of the collections label, open or folded', () => {
    const toggle = () => undefined;
    const open = render(entries(['trabajo']), false, { onToggle: toggle });
    const folded = render(entries(['trabajo']), false, { onToggle: toggle, folded: true });

    expect(open).toContain('aria-label="Hide collections"');
    expect(open.indexOf('Hide collections')).toBeLessThan(open.indexOf('>collections<'));
    expect(folded).toContain('aria-label="Show collections"');
    expect(folded.indexOf('Show collections')).toBeLessThan(folded.indexOf('>collections<'));
  });

  it('keeps nothing but you and Preferences at the foot', () => {
    const html = render(entries(['trabajo']), false, { onToggle: () => undefined });

    expect(html.slice(html.indexOf('class="rail-foot"'))).not.toContain('sidebar-toggle');
  });

  it('offers no fold toggle where the sidebar cannot fold (the phone’s panel)', () => {
    expect(render(entries(['trabajo']), false, { variant: 'panel' })).not.toContain(
      'sidebar-toggle',
    );
  });

  it('lists only Studio and Settings among the project’s places', () => {
    const html = render(entries(['trabajo']), false);
    const project = html.slice(html.indexOf('class="rail-project"'), html.indexOf('rail-foot'));

    expect(project).toContain('href="#/studio"');
    expect(project).toContain('href="#/settings"');
    expect(project).not.toContain('href="#/modules"');
    expect(project).not.toContain('href="#/lan"');
    expect(project).not.toContain('Phone access');
  });

  it('expands Studio into its blueprint, its presets and the modules while it is open', () => {
    const html = render(entries(['trabajo']), false, { studio: true, tree });

    expect(html).toContain('2 presets');
    expect(anchor(html, '#/studio/blueprint')).not.toBe('');
    expect(html).toContain('game-studio');
    expect(html).toContain('v1 · 3 boards');
    expect(anchor(html, '#/studio/preset/tasks')).not.toBe('');
    expect(html).toContain('v2 · work');
    expect(html.match(/>official</g)).toHaveLength(1);
    expect(anchor(html, '#/studio/preset/game-bugs')).not.toBe('');
    expect(html).toContain('v3 · bugs');
    expect(anchor(html, '#/modules')).not.toBe('');
    expect(html).toContain('>15<');
  });

  it('marks the tree row in view', () => {
    const html = render(entries(['trabajo']), false, { studio: true, tree });

    expect(anchor(html, '#/studio/preset/game-bugs')).toContain('aria-current="page"');
    expect(anchor(html, '#/studio/preset/tasks')).not.toContain('aria-current');
  });

  it('keeps Studio open on the module catalog, with Modules marked', () => {
    const html = render(entries(['trabajo']), false, {
      modules: true,
      tree: { ...tree, current: { kind: 'modules' } },
    });

    expect(html).toContain('2 presets');
    expect(anchor(html, '#/modules')).toContain('aria-current="page"');
  });

  it('leads to the blueprints to pick from when the project has none', () => {
    const html = render(entries(['trabajo']), false, {
      studio: true,
      tree: { ...tree, blueprint: null, current: undefined },
    });

    expect(anchor(html, '#/studio/blueprints')).not.toBe('');
    expect(html).toContain('No blueprint yet');
  });

  it('closes the tree away from Studio, and while folded', () => {
    expect(render(entries(['trabajo']), false, { tree })).not.toContain('game-studio');
    expect(render(entries(['trabajo']), false, { studio: true, tree, folded: true })).not.toContain(
      'game-studio',
    );
  });

  it('says the tree in Spanish', () => {
    setLanguage('es');
    const html = render(entries(['trabajo']), false, { studio: true, tree });

    // As Studio says it in Spanish: a preset keeps its name there.
    expect(html).toContain('2 presets');
    expect(html).toContain('>oficial<');
    expect(html).toContain('Módulos');
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
});
