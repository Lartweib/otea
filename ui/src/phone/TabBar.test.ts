import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { IC } from '../kit/Icon.tsx';
import { captureTarget, TabBarView, type TabBarViewProps, tabBarFor, tabOn } from './TabBar.tsx';

afterEach(() => setLanguage('en'));

const ws = { intake: null, activity: false };

const props = (o: Partial<TabBarViewProps> = {}): TabBarViewProps => ({
  on: 'toca',
  toca: 2,
  panelOpen: false,
  canCreate: true,
  onToca: () => {},
  onNew: () => {},
  onPanel: () => {},
  ...o,
});
const render = (p: TabBarViewProps) => renderToStaticMarkup(createElement(TabBarView, p));
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('tabBarFor (mock 1, 4)', () => {
  it('stands on every page of the project', () => {
    for (const view of ['toca', 'atasco', 'triage', 'settings', 'projects'] as const)
      expect(tabBarFor({ view }, ws), view).toBe(true);
    expect(tabBarFor({ view: 'board', board: 'Tareas' }, ws)).toBe(true);
    expect(tabBarFor({ view: 'studio', page: { kind: 'boards' } }, ws)).toBe(true);
  });

  it('goes while an item, the new item page or the activity drawer takes the screen', () => {
    expect(tabBarFor({ view: 'toca', item: 'TAR-1' }, ws)).toBe(false);
    expect(tabBarFor({ view: 'toca' }, { ...ws, intake: { board: 'Tareas' } })).toBe(false);
    expect(tabBarFor({ view: 'toca' }, { ...ws, activity: true })).toBe(false);
  });
});

describe('tabOn', () => {
  it('lights Te toca on your lists and Panel on a board', () => {
    expect(tabOn({ view: 'toca' })).toBe('toca');
    expect(tabOn({ view: 'lan' })).toBe('toca');
    expect(tabOn({ view: 'atasco' })).toBe('toca');
    expect(tabOn({ view: 'triage' })).toBe('toca');
    expect(tabOn({ view: 'board', board: 'Tareas' })).toBe('panel');
    expect(tabOn({ view: 'settings' })).toBeNull();
  });
});

describe('TabBarView', () => {
  it('is three tabs in a row: Te toca with its count, Nuevo, Panel', () => {
    const html = render(props());
    expect(html).toMatch(/^<nav class="tabbar" aria-label="Navigation">/);
    const order = ['data-tab="toca"', 'Your turn', 'data-tab="new"', 'New', 'data-tab="panel"'];
    let at = -1;
    for (const w of order) {
      const i = html.indexOf(w, at + 1);
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toMatch(/class="tbadge"[^>]*>2</);
    expect(text(html)).toBe('2Your turnNewPanel');
  });

  it('marks where you are and that the panel opens a sheet', () => {
    const html = render(props({ on: 'panel', panelOpen: true }));
    expect(html).toMatch(/<button[^>]*class="tab on"[^>]*data-tab="panel"[^>]*aria-current="page"/);
    expect(html).toMatch(/data-tab="panel"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="true"/);
    expect(html.match(/class="tab on"/g)).toHaveLength(1);
  });

  it('says nothing for nothing waiting', () => {
    expect(render(props({ toca: 0 }))).not.toContain('class="tbadge"');
  });

  it('draws the create button as the ink round with a +, the panel with its own icon', () => {
    const html = render(props());
    expect(html).toMatch(/data-tab="new"[^>]*><span class="disc"><svg/);
    expect(html).toContain(IC.plus);
    expect(html).toContain(IC.panel);
  });

  it('cannot create without the right to write', () => {
    expect(render(props({ canCreate: false }))).toMatch(/data-tab="new"[^>]*disabled=""/);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const html = render(props());
    expect(html).toContain('aria-label="Navegación"');
    expect(text(html)).toBe('2Te tocaNuevoPanel');
  });
});

describe('captureTarget', () => {
  it('captures on the board in view; anywhere else the capture picks the board', () => {
    expect(captureTarget({ view: 'board', board: 'Tareas' })).toEqual({ board: 'Tareas' });
    expect(captureTarget({ view: 'toca' })).toEqual({});
    expect(captureTarget({ view: 'settings' })).toEqual({});
  });
});
