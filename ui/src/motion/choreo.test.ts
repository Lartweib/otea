import { describe, expect, it } from 'vitest';
import { mirrorDelays, part } from './choreo.ts';

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
