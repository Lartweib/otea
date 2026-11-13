import { describe, expect, it } from 'vitest';
import { closeT, leaveTogether, mirrorDelays, part } from './choreo.ts';

// The item's sheet (sweep #6): closing, every part leaves at once and within one fade, so nothing
// stays opaque while what is under it changes.
describe('a close that leaves together', () => {
  it('starts every part at once and ends them all within the fade', () => {
    const line = part(null, { opacity: 0 }, { opacity: 1 }, 640, 'ink', 40);
    const sheet = part(null, { opacity: 0 }, { opacity: 1 }, 360, 'drift', 60);
    const slide = part(null, { opacity: 0 }, { opacity: 1 }, 600, 'settle', 60);
    const row = part(null, { opacity: 0 }, { opacity: 1 }, 180, 'drift', 160);
    leaveTogether([line, sheet, slide, row], 240);
    mirrorDelays([line, sheet, slide, row]);
    for (const p of [line, sheet, slide, row]) {
      expect(p.d1).toBe(0);
      expect(closeT(p)).toBeLessThanOrEqual(240);
    }
    expect(closeT(row)).toBe(180);
  });

  it('closes a part in its own time when nothing shortens it', () => {
    expect(closeT(part(null, { opacity: 0 }, { opacity: 1 }, 420, 'drift'))).toBe(420);
  });
});

describe('a close mirrors its open', () => {
  it('gives each part the delay that ends it where its open began', () => {
    const line = part(null, { opacity: 0 }, { opacity: 1 }, 280, 'glide', 0);
    const surface = part(null, { opacity: 0 }, { opacity: 1 }, 440, 'settle', 50);
    const row = part(null, { opacity: 0 }, { opacity: 1 }, 340, 'drift', 80);
    const D = mirrorDelays([line, surface, row]);
    expect(D).toBe(490);
    expect(line.d1).toBe(210);
    expect(surface.d1).toBe(0);
    expect(row.d1).toBe(70);
  });

  it('keeps a close delay given by hand', () => {
    const a = part(null, { opacity: 0 }, { opacity: 1 }, 100, 'drift', 0, { d1: 5 });
    mirrorDelays([a]);
    expect(a.d1).toBe(5);
  });

  it('marks the parts that only exist under reduced motion', () => {
    const only = part(null, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true });
    expect(only.ronly).toBe(true);
  });
});
