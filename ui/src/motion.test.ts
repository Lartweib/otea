import { describe, expect, it } from 'vitest';
import { revealRadius } from './motion.ts';

describe('revealRadius', () => {
  it('reaches the farthest corner of the viewport', () => {
    expect(revealRadius(0, 0, 300, 400)).toBe(500);
    expect(revealRadius(1240, 30, 1280, 800)).toBeCloseTo(Math.hypot(1240, 770));
    expect(revealRadius(640, 400, 1280, 800)).toBeCloseTo(Math.hypot(640, 400));
  });

  it('covers the viewport from a point outside it', () => {
    expect(revealRadius(-30, -40, 0, 0)).toBe(50);
  });
});
