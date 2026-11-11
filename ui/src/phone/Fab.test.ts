import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { FabButton, fabFor } from './Fab.tsx';

afterEach(() => setLanguage('en'));

const ws = { intake: null, activity: false };

describe('fabFor', () => {
  it('shows on the lists: Te toca, Atasco and a board (with its board)', () => {
    expect(fabFor({ view: 'toca' }, ws)).toEqual({});
    expect(fabFor({ view: 'atasco' }, ws)).toEqual({});
    expect(fabFor({ view: 'board', board: 'Errores' }, ws)).toEqual({ board: 'Errores' });
  });

  it('hides while an item or the new item page is open', () => {
    expect(fabFor({ view: 'toca', item: 'ERR-1' }, ws)).toBeNull();
    expect(
      fabFor({ view: 'board', board: 'Errores' }, { ...ws, intake: { board: 'Errores' } }),
    ).toBeNull();
  });

  it('goes under the activity drawer', () => {
    expect(fabFor({ view: 'toca' }, { ...ws, activity: true })).toBeNull();
  });

  it('hides everywhere else', () => {
    expect(fabFor({ view: 'triage' }, ws)).toBeNull();
    expect(fabFor({ view: 'settings' }, ws)).toBeNull();
    expect(fabFor({ view: 'lan' }, ws)).toBeNull();
    expect(fabFor({ view: 'projects' }, ws)).toBeNull();
  });
});

describe('FabButton', () => {
  it('is the round +: the plus only, named for a screen reader', () => {
    const html = renderToStaticMarkup(createElement(FabButton, { onPress: () => {} }));
    expect(html).toMatch(/^<button type="button" class="fab" aria-label="New item"/);
    expect(html).toContain('<svg');
    expect(html.replace(/<[^>]+>/g, '')).toBe('');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(createElement(FabButton, { onPress: () => {} }));
    expect(html).toContain('aria-label="Nuevo ítem"');
  });
});
