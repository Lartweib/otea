import { describe, expect, it } from 'vitest';
import { GRID, hideTier, monogram, slotCentre, slotLeft } from './row-grid.ts';

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

describe('monogram', () => {
  it('takes the first letter and the first of the suffix after the last dash', () => {
    expect(monogram('claude-b')).toBe('cb');
    expect(monogram('codex-cloud-west')).toBe('cw');
  });

  it('takes the first two letters without a usable suffix', () => {
    expect(monogram('gemini')).toBe('ge');
    expect(monogram('claude-')).toBe('cl');
    expect(monogram('-x')).toBe('-x');
  });

  it('keeps you as you', () => {
    expect(monogram('you')).toBe('you');
  });
});
