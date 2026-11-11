import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { C, type Curve, clamp, F, inkFn, lerp, linearOf, springFn, sstep } from './curves.ts';

const CURVES: Curve[] = ['settle', 'glide', 'drift', 'ink'];

// Where a curve reaches half its travel, as a share of its time.
function halfAt(fn: (t: number) => number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < 0.5) lo = mid;
    else hi = mid;
  }
  return hi;
}

describe('the four curves', () => {
  it.each([
    ['settle', 0.21],
    ['glide', 0.16],
    ['drift', 0.245],
    ['ink', 0.36],
  ] as const)('%s reaches half its travel at about %s of its time', (curve, at) => {
    expect(Math.abs(halfAt(F[curve]) - at)).toBeLessThan(0.012);
  });

  it.each(CURVES)('%s starts at 0, ends at 1 and never turns back', (curve) => {
    const fn = F[curve];
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
    expect(fn(-1)).toBe(0);
    expect(fn(2)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 400; i++) {
      const v = fn(i / 400);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('builds the same curves from their parameters', () => {
    expect(springFn(8, 0)(0.3)).toBe(F.settle(0.3));
    expect(inkFn()(0.5)).toBe(F.ink(0.5));
  });

  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  const token = (curve: Curve) =>
    new RegExp(`--o-${curve}: (linear\\([^)]*\\));`).exec(css)?.[1] ?? '';

  it.each(CURVES)('hands WAAPI the very linear() the stylesheet holds for %s', (curve) => {
    expect(C[curve]).toBe(token(curve));
  });

  it.each(['settle', 'glide', 'drift'] as const)('samples %s into that same string', (curve) => {
    expect(linearOf(F[curve])).toBe(token(curve));
  });

  it('samples the pen to within a hair of the stylesheet', () => {
    const stops = (s: string) =>
      s
        .slice(7, -1)
        .split(', ')
        .map((stop) => Number(stop.split(' ')[0]));
    const ours = stops(linearOf(F.ink));
    const theirs = stops(token('ink'));
    expect(ours).toHaveLength(theirs.length);
    ours.forEach((v, i) => {
      expect(Math.abs(v - (theirs[i] ?? 0))).toBeLessThan(0.0007);
    });
  });

  it('keeps hover and press on the ease, and a plain linear', () => {
    expect(C.ease).toBe('cubic-bezier(.25,1,.5,1)');
    expect(C.linear).toBe('linear');
  });

  it('steps, clamps and lerps', () => {
    expect(sstep(0)).toBe(0);
    expect(sstep(0.5)).toBe(0.5);
    expect(sstep(1)).toBe(1);
    expect(clamp(2)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});
