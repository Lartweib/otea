import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { sheetItem } from './frame.ts';
import { ItemMissing } from './ItemMissing.tsx';

afterEach(() => setLanguage('en'));

const render = (phone = false) =>
  renderToStaticMarkup(createElement(ItemMissing, { id: 'NOPE-1', phone, onClose: () => {} }));

describe('the sheet of an item that is not there', () => {
  it('never keeps the item that was open before', () => {
    const before = { id: 'ERR-1' };
    // The server has no NOPE-1: the sheet holds nothing, not ERR-1.
    expect(sheetItem(before, 'NOPE-1', null)).toBeNull();
    // NOPE-1 is still on its way: the sheet keeps ERR-1 until it lands.
    expect(sheetItem(before, 'NOPE-1', undefined)).toBe(before);
    // The sheet closes: it keeps what it showed, item or nothing.
    expect(sheetItem(before, null, undefined)).toBe(before);
    expect(sheetItem(null, null, undefined)).toBeNull();
    const next = { id: 'ERR-2' };
    expect(sheetItem(before, 'ERR-2', next)).toBe(next);
  });

  it('says which item was not found, why it may be, and offers Cerrar', () => {
    setLanguage('es');
    const html = render();
    expect(html).toContain('<span class="id">NOPE-1</span>');
    expect(html).toMatch(/<h1 class="headline" data-c="true">Ítem no encontrado<\/h1>/);
    expect(html).toContain('No hay ningún ítem NOPE-1 en este proyecto.');
    expect(html).toMatch(/class="[^"]*closeb[^"]*"[^>]*>Cerrar</);
  });

  it('speaks English, and says Back on the phone', () => {
    expect(render()).toContain('Item not found');
    expect(render()).toContain('There is no item NOPE-1 in this project.');
    expect(render()).toMatch(/closeb[^>]*>Close</);
    expect(render(true)).toMatch(/closeb[^>]*>Back</);
  });
});
