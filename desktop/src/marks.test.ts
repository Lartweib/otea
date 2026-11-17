import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encodeIco } from './ico.ts';
import {
  appIconSvg,
  faviconSvg,
  INK_ON_DARK,
  INK_ON_LIGHT,
  MARK,
  macAppIconSvg,
  markSvg,
  overlaySvg,
  pwaIconSvg,
  TEMPLATE,
} from './marks.ts';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'public');

describe('markSvg', () => {
  it('shows the blue dot while something is yours or an agent works, never at rest', () => {
    expect(markSvg('idle', 16, INK_ON_LIGHT)).not.toContain(MARK);
    expect(markSvg('yours', 16, INK_ON_LIGHT)).toContain(MARK);
    expect(markSvg('working', 16, INK_ON_LIGHT)).toContain(MARK);
    expect(markSvg('yours-working', 16, INK_ON_LIGHT)).toContain(MARK);
  });

  it('is the same blue on light and dark grounds', () => {
    expect(INK_ON_DARK.you).toBe(MARK);
    expect(INK_ON_LIGHT.you).toBe(MARK);
  });

  it('draws the trail only while an agent works, and turns dot and trail 30° a step', () => {
    expect(markSvg('yours', 16, INK_ON_LIGHT)).not.toContain('<path');
    expect(markSvg('working', 16, INK_ON_LIGHT)).toContain('<path');
    expect(markSvg('working', 16, INK_ON_LIGHT, 0)).not.toBe(
      markSvg('working', 16, INK_ON_LIGHT, 1),
    );
    expect(markSvg('working', 16, INK_ON_LIGHT, 0)).toBe(markSvg('working', 16, INK_ON_LIGHT, 12));
  });

  it('keeps the dot top right while yours, and still frames of work bottom right', () => {
    // 16 grid: ring centre line r 6, so top right is (12.24, 3.76) and bottom right (12.24, 12.24)
    expect(markSvg('yours', 16, INK_ON_LIGHT)).toContain('cx="12.24" cy="3.76"');
    expect(markSvg('working', 16, INK_ON_LIGHT)).toContain('cx="12.24" cy="12.24"');
  });

  it('grows the dot only while an agent works', () => {
    const r = (s: string) => Number(/class="dot"[^>]* r="([\d.]+)"/.exec(s)?.[1]);
    const still = r(markSvg('yours', 32, INK_ON_LIGHT));
    expect(r(markSvg('working', 32, INK_ON_LIGHT))).toBeCloseTo(still * 1.22, 1);
  });

  it('says yours with the dot in a template image, with no color', () => {
    expect(markSvg('yours', 16, TEMPLATE)).toContain('class="dot"');
    expect(markSvg('idle', 16, TEMPLATE)).not.toContain('class="dot"');
    expect(markSvg('yours', 16, TEMPLATE)).not.toContain(MARK);
  });
});

describe('the favicons in ui/public', () => {
  it.each(['idle', 'yours', 'working', 'yours-working'] as const)('%s is faviconSvg', (frame) => {
    const file = readFileSync(join(PUBLIC, `otea-${frame}.svg`), 'utf8');
    expect(file.trim()).toBe(faviconSvg(frame).trim());
  });
});

describe('overlaySvg and appIconSvg', () => {
  it('puts the blue dot on the app icon at every size', () => {
    for (const size of [16, 24, 32, 256]) expect(appIconSvg(size)).toContain(MARK);
    expect(macAppIconSvg()).toContain(MARK);
  });

  it('keeps the working overlay in ink, and the yours overlay blue', () => {
    expect(overlaySvg('working', 16)).not.toContain(MARK);
    expect(overlaySvg('yours', 16)).toContain(MARK);
  });

  it('draws the home-screen icons edge to edge, the maskable one inside the safe circle', () => {
    expect(pwaIconSvg(512, 'maskable')).toContain('width="512" height="512" fill');
    // the ring's outer edge stays inside the 40% safe radius
    const outer = /ring" cx="256" cy="256" r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/.exec(
      pwaIconSvg(512, 'maskable'),
    );
    expect(Number(outer?.[1]) + Number(outer?.[2]) / 2).toBeLessThanOrEqual(512 * 0.4);
  });
});

describe('encodeIco', () => {
  it('writes a directory of PNG entries, 256 as 0', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const ico = encodeIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(22)).toBe(0);
    expect(ico.readUInt32LE(6 + 8)).toBe(3);
    expect(ico.readUInt32LE(6 + 12)).toBe(38);
    expect(ico.readUInt32LE(22 + 12)).toBe(41);
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('refuses a size an icon entry cannot hold', () => {
    expect(() => encodeIco([{ size: 512, png: new Uint8Array() }])).toThrow(RangeError);
  });
});
