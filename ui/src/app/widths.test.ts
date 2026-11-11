import { describe, expect, it } from 'vitest';
import { listWidth } from './widths.ts';

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
