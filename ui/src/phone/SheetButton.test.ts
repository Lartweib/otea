import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { IC } from '../kit/Icon.tsx';
import { SheetButtonView, sheetButtonFor } from './SheetButton.tsx';

afterEach(() => setLanguage('en'));

const ws = { intake: null, activity: false };

describe('sheetButtonFor', () => {
  it('shows on every page of the project', () => {
    for (const view of ['toca', 'atasco', 'triage', 'settings', 'projects'] as const)
      expect(sheetButtonFor({ view }, ws), view).toBe(true);
    expect(sheetButtonFor({ view: 'board', board: 'Errores' }, ws)).toBe(true);
  });

  it('goes away while an item, the new item page or the activity drawer takes the screen', () => {
    expect(sheetButtonFor({ view: 'toca', item: 'ERR-1' }, ws)).toBe(false);
    expect(sheetButtonFor({ view: 'toca' }, { ...ws, intake: { board: 'Errores' } })).toBe(false);
    expect(sheetButtonFor({ view: 'toca' }, { ...ws, activity: true })).toBe(false);
  });
});

describe('SheetButtonView', () => {
  it('is a round button with the rising-sheet icon, named and saying it opens a dialog', () => {
    const html = renderToStaticMarkup(
      createElement(SheetButtonView, { open: false, onPress: () => {} }),
    );
    expect(html).toMatch(/^<button type="button" class="sheetbtn"/);
    expect(html).toContain('aria-label="Open the project panel"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(IC.sheet);
    expect(html.replace(/<[^>]+>/g, '')).toBe('');
  });

  it('says when the sheet is up, in Spanish too', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      createElement(SheetButtonView, { open: true, onPress: () => {} }),
    );
    expect(html).toContain('aria-label="Abrir el panel del proyecto"');
    expect(html).toContain('aria-expanded="true"');
  });
});

describe('the sheet icon', () => {
  it('is drawn in the mock’s set: a screen, a sheet risen from its foot and the way it came', () => {
    expect(IC.sheet).toMatch(/<rect x="2.3" y="3" width="11.4" height="10" rx="1.6"\/>/);
    // the sheet: its rounded top inside the screen, standing on the screen's foot
    expect(IC.sheet).toContain(
      '<path d="M3.9 13v-2.3a1.3 1.3 0 0 1 1.3-1.3h5.6a1.3 1.3 0 0 1 1.3 1.3V13"/>',
    );
    // the way up
    expect(IC.sheet).toContain('<path d="M6.5 6.9 8 5.4l1.5 1.5"/>');
  });
});
