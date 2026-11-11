import { describe, expect, it } from 'vitest';
import { spring } from './spring.ts';

describe('the drag spring', () => {
  it('starts where the finger let go, with its velocity', () => {
    const at = spring(100, 0, -0.5, 480);
    expect(at(0).x).toBeCloseTo(100, 6);
    expect(at(0).v).toBeCloseTo(-0.5, 6);
  });

  it('lands at its target and rests there', () => {
    const at = spring(100, 0, 0.8, 480);
    expect(at(480).x).toBeCloseTo(0, 6);
    expect(at(480).v).toBeCloseTo(0, 6);
    expect(at(900)).toEqual({ x: 0, v: 0 });
  });

  it('never passes the target when it starts at rest', () => {
    const at = spring(100, 0, 0, 480);
    for (let t = 0; t <= 480; t += 8) expect(at(t).x).toBeGreaterThanOrEqual(-1e-9);
  });

  it('moves continuously: no jump between frames', () => {
    const at = spring(0, 200, 1.2, 560);
    let prev = at(0).x;
    for (let t = 1; t <= 560; t++) {
      const x = at(t).x;
      expect(Math.abs(x - prev)).toBeLessThan(3);
      prev = x;
    }
  });
});
