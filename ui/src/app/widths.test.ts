import { describe, expect, it } from 'vitest';
import { listWidth, PAGE_MIN, pageSplit, splitKindOf, splitOf } from './widths.ts';

describe('a page beside a sheet (Configuración, Rendimiento, Studio)', () => {
  it('splits by what the view shows, never by the last board’s Lista or Tabla', () => {
    expect(splitKindOf('settings', 'list')).toBe('page');
    expect(splitKindOf('settings', 'table')).toBe('page');
    expect(splitKindOf('performance', 'cards')).toBe('page');
    expect(splitKindOf('studio', 'list')).toBe('page');
    expect(splitKindOf('board', 'table')).toBe('table');
    expect(splitKindOf('toca', 'list')).toBe('list');
    expect(splitKindOf('triage', 'cards')).toBe('cards');
  });

  it('docks the sheet at the right and leaves the page at least its readable width', () => {
    // 2560 wide: the page keeps 1235, the sheet takes the 1040 to the right edge.
    expect(pageSplit(2284, null)).toEqual({ listw: 1235, overlay: false });
    // 1920 wide: the page never goes under its minimum; the sheet takes the rest.
    expect(pageSplit(1644, null)).toEqual({ listw: PAGE_MIN, overlay: false });
    expect(PAGE_MIN).toBeGreaterThanOrEqual(900);
  });

  it('lays the sheet over the page when both cannot fit, instead of squeezing the page', () => {
    // 1440 wide: the page stays whole under a 680 px sheet docked at the right.
    expect(pageSplit(1164, null)).toEqual({ listw: 1164 - 9 - 680, overlay: true });
    expect(pageSplit(500, null)).toEqual({ listw: 0, overlay: true });
  });

  it('remembers a dragged page width, within the page’s bounds', () => {
    expect(pageSplit(2284, 1500)).toEqual({ listw: 1500, overlay: false });
    expect(pageSplit(2284, 400)).toEqual({ listw: PAGE_MIN, overlay: false });
    expect(pageSplit(2284, 2200)).toEqual({ listw: 2284 - 9 - 560, overlay: false });
  });

  it('keeps the lists as they were', () => {
    expect(splitOf(2000, 'list', null)).toEqual({ listw: 680, overlay: false });
    expect(splitOf(2600, 'table', null)).toEqual({ listw: 1320, overlay: false });
    expect(splitOf(2284, 'page', null)).toEqual({ listw: 1235, overlay: false });
  });
});

describe('the list’s width beside the detail', () => {
  it('gives a list a third of the room, between 520 and 783 px', () => {
    expect(listWidth(1196, 'list')).toBe(520);
    expect(listWidth(2000, 'list')).toBe(680);
    expect(listWidth(3000, 'list')).toBe(783);
  });

  it('keeps 440 px for the sheet, and never goes under 340', () => {
    expect(listWidth(900, 'list')).toBe(451);
    expect(listWidth(600, 'list')).toBe(340);
    expect(listWidth(1196, 'list', 900)).toBe(747);
  });

  it('gives a table what leaves the sheet 520 px, up to 1320', () => {
    expect(listWidth(1400, 'table')).toBe(871);
    expect(listWidth(2600, 'table')).toBe(1320);
    expect(listWidth(1400, 'table', 600)).toBe(600);
  });

  it('remembers what the person dragged, within the same bounds', () => {
    expect(listWidth(2000, 'list', 600)).toBe(600);
    expect(listWidth(2000, 'list', 100)).toBe(340);
    expect(listWidth(2000, 'cards', 700)).toBe(700);
  });
});
