import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { BOARD_ICONS, boardIconName } from './glyphs.tsx';

afterEach(() => setLanguage('en'));

describe('the icons a board can wear', () => {
  it('names each in the language on screen, never by its id', () => {
    setLanguage('es');
    expect(BOARD_ICONS.map(boardIconName)).toEqual([
      'Tablero',
      'Error',
      'Huella',
      'Libro',
      'Bandeja',
      'Matraz',
      'Visto',
    ]);
    setLanguage('en');
    expect(boardIconName('check2')).toBe('Check');
  });
});
