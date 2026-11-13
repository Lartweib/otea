import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { renderIn, testApp } from '../shell/test-app.ts';
import { DeskOnly, deskOnlyOf } from './DeskOnly.tsx';

afterEach(() => setLanguage('en'));

describe('deskOnlyOf', () => {
  it('names the pages that live on the computer: Studio, Settings and the module catalog', () => {
    expect(deskOnlyOf({ view: 'studio', page: { kind: 'boards' } })).toBe('studio');
    expect(deskOnlyOf({ view: 'studio', page: { kind: 'board', board: 'b1' } })).toBe('studio');
    expect(deskOnlyOf({ view: 'settings' })).toBe('settings');
    expect(deskOnlyOf({ view: 'modules' })).toBe('modules');
    expect(deskOnlyOf({ view: 'performance' })).toBe('performance');
  });

  it('leaves every page the phone keeps alone', () => {
    for (const view of ['toca', 'atasco', 'triage', 'projects', 'lan'] as const)
      expect(deskOnlyOf({ view }), view).toBeNull();
    expect(deskOnlyOf({ view: 'board', board: 'Tareas' })).toBeNull();
    expect(deskOnlyOf({ view: 'brief', ids: ['TAR-1'] })).toBeNull();
  });
});

describe('DeskOnly', () => {
  const render = (page: 'studio' | 'settings' | 'modules' | 'performance') =>
    renderIn(testApp(), createElement(DeskOnly, { page }));

  it('says the page is on the computer, in the page’s own head, and offers the way to Te toca', () => {
    const html = render('studio');
    expect(html).toContain('<h1 class="display" data-leaf="">Studio</h1>');
    expect(html).toContain('Studio is on the computer.');
    expect(html).toMatch(/<button[^>]*>Go to Your turn<\/button>/);
  });

  it('names Settings and the catalog too, and speaks Spanish', () => {
    expect(render('settings')).toContain('Settings is on the computer.');
    expect(render('modules')).toContain('The module catalog is on the computer.');
    expect(render('performance')).toContain('Performance is on the computer.');
    setLanguage('es');
    const html = render('settings');
    expect(html).toContain('<h1 class="display" data-leaf="">Configuración</h1>');
    expect(html).toContain('Configuración está en el ordenador.');
    expect(html).toContain('Ir a Te toca');
  });
});
