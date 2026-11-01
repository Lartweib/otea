import { describe, expect, it } from 'vitest';
import {
  cubicBezier,
  dissolveAt,
  lerpPath,
  MORPH,
  resolveAt,
  rowStagger,
  stepClock,
  travelAt,
} from './morph.ts';

const close = (value: number, digits = 3) => Number(value.toFixed(digits));

describe('the list-grid morph clock', () => {
  it('runs 480ms, on one clock that a late frame slows but never skips', () => {
    expect(MORPH.duration).toBe(480);
    expect(stepClock(0, 1, 16, 480)).toBeCloseTo(16 / 480);
    expect(stepClock(0.5, 1, 200, 480)).toBeCloseTo(0.5 + 34 / 480);
    expect(stepClock(0.99, 1, 16, 480)).toBe(1);
    expect(stepClock(0.3, -1, 16, 480)).toBeCloseTo(0.3 - 16 / 480);
    expect(stepClock(0.01, -1, 16, 480)).toBe(0);
  });

  it('eases on a cubic bézier: the turn change carry curve, symmetric', () => {
    const carry = cubicBezier(0.65, 0, 0.35, 1);

    expect(carry(0)).toBe(0);
    expect(carry(1)).toBe(1);
    expect(close(carry(0.5))).toBe(0.5);
    expect(close(carry(0.25) + carry(0.75))).toBe(1);
    expect(carry(0.1)).toBeLessThan(0.1);
  });

  it('carries the shared pieces over the first 72% of the clock', () => {
    expect(travelAt(0)).toBe(0);
    expect(close(travelAt(0.36))).toBe(0.5);
    expect(travelAt(0.72)).toBe(1);
    expect(travelAt(0.9)).toBe(1);
  });

  it('resolves grid-only pieces from 42%, left to right and down the view, 26% each', () => {
    expect(resolveAt(0.42, 0, 0)).toBe(0);
    expect(resolveAt(0.68, 0, 0)).toBe(1);
    expect(resolveAt(0.5, 1, 0)).toBe(0);
    expect(resolveAt(0.84, 1, 0)).toBe(1);
    expect(resolveAt(0.55, 0, 0.08)).toBeLessThan(resolveAt(0.55, 0, 0));
    expect(close(resolveAt(0.55, 0, 0))).toBe(close(1 - (1 - 0.13 / 0.26) ** 3));
  });

  it('dissolves list-only pieces first, over 22%, so going back they resolve last', () => {
    expect(dissolveAt(0, 0, 0)).toBe(1);
    expect(dissolveAt(0.22, 0, 0)).toBe(0);
    expect(dissolveAt(0.1, 1, 0)).toBeGreaterThan(dissolveAt(0.1, 0, 0));
    expect(dissolveAt(0.3, 1, 0.04)).toBe(0);
  });

  it('staggers rows down the viewport by at most 8% of the clock', () => {
    expect(rowStagger(0, 0, 800)).toBe(0);
    expect(rowStagger(400, 0, 800)).toBeCloseTo(0.04);
    expect(rowStagger(5000, 0, 800)).toBe(0.08);
    expect(rowStagger(-200, 0, 800)).toBe(0);
  });
});

describe('lerpPath', () => {
  it('blends two paths of the same commands number by number', () => {
    expect(lerpPath('M16 0 V100 C16 120 28 120 28 140', 'M16 0 V60 C16 80 28 80 28 100', 0.5)).toBe(
      'M16 0 V80 C16 100 28 100 28 120',
    );
  });

  it('takes the target when the two paths differ in shape', () => {
    expect(lerpPath('M16 0 V100', 'M16 0 V60 C16 80 28 80 28 100', 0.5)).toBe(
      'M16 0 V60 C16 80 28 80 28 100',
    );
  });
});
