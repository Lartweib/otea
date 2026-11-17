import { describe, expect, it } from 'vitest';
import { BOARD_ICONS, iconChoices } from './glyphs.tsx';

describe('iconChoices', () => {
  it('offers the board icons, the chosen one among them', () => {
    expect(iconChoices('bug')).toEqual([...BOARD_ICONS]);
  });

  it('puts the board’s own icon first when the picker has no drawing of its own for it (UI3-4)', () => {
    const choices = iconChoices('fork');
    expect(choices[0]).toBe('fork');
    expect(choices.slice(1)).toEqual([...BOARD_ICONS]);
  });
});
