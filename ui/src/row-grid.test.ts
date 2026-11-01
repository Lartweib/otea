import { describe, expect, it } from 'vitest';
import { GRID, hideTier, slotCentre, slotLeft } from './row-grid.ts';

describe('the row grid', () => {
  it('reserves the fold and type slots and steps 28px a level', () => {
    expect(slotLeft(0)).toBe(GRID.rail + GRID.fold);
    expect(slotLeft(2) - slotLeft(1)).toBe(28);
    expect(slotCentre(0)).toBe(94);
  });
});

describe('hideTier', () => {
  it('shows everything from 600px', () => {
    expect(hideTier(600)).toBe(1);
    expect(hideTier(783)).toBe(1);
  });

  it('drops priority and evidence under 600, the name under 480, who under 380', () => {
    expect(hideTier(599)).toBe(2);
    expect(hideTier(480)).toBe(2);
    expect(hideTier(479.5)).toBe(3);
    expect(hideTier(380)).toBe(3);
    expect(hideTier(379)).toBe(4);
    expect(hideTier(340)).toBe(4);
  });
});
