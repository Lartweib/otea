import { describe, expect, it } from 'vitest';
import { encodeIco } from './ico.ts';
import { appIconSvg, INK_ON_LIGHT, markSvg, overlaySvg, TEMPLATE } from './marks.ts';

const BLUE = INK_ON_LIGHT.you;

describe('markSvg', () => {
  it('fills the counter in blue only when something is yours', () => {
    expect(markSvg('idle', 16, INK_ON_LIGHT)).not.toContain(BLUE);
    expect(markSvg('working', 16, INK_ON_LIGHT)).not.toContain(BLUE);
    expect(markSvg('yours', 16, INK_ON_LIGHT)).toContain(BLUE);
    expect(markSvg('yours-working', 16, INK_ON_LIGHT)).toContain(BLUE);
  });

  it('draws the orbit only while an agent works, and turns it 30° a step', () => {
    expect(markSvg('idle', 16, INK_ON_LIGHT)).not.toContain('<path');
    expect(markSvg('working', 16, INK_ON_LIGHT)).toContain('<path');
    expect(markSvg('working', 16, INK_ON_LIGHT, 0)).not.toBe(
      markSvg('working', 16, INK_ON_LIGHT, 1),
    );
    expect(markSvg('working', 16, INK_ON_LIGHT, 0)).toBe(markSvg('working', 16, INK_ON_LIGHT, 12));
  });

  it('matches the favicon geometry on the 16 grid', () => {
    // ui/public/otea-yours-working.svg: orbit from (9.26, 0.86), node r 3.93 at 2.14
    const svg = markSvg('yours-working', 16, INK_ON_LIGHT);
    expect(svg).toContain('M9.26 0.86');
    expect(svg).toContain('r="3.93" fill="none" stroke="#1b1f29" stroke-width="2.14"');
  });

  it('says yours as a filled node in a template image, with no color', () => {
    const yours = markSvg('yours', 16, TEMPLATE);
    expect(yours).toContain('r="7" fill="#000"');
    expect(markSvg('idle', 16, TEMPLATE)).toContain('fill="none"');
  });
});

describe('overlaySvg and appIconSvg', () => {
  it('never puts blue on the static app icon, nor on the working overlay', () => {
    for (const size of [16, 24, 32, 256]) expect(appIconSvg(size)).not.toContain(BLUE);
    expect(overlaySvg('working', 16)).not.toContain(BLUE);
    expect(overlaySvg('yours', 16)).toContain(BLUE);
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
