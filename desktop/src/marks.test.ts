import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encodeIco } from './ico.ts';
import {
  appIconSvg,
  BADGE_LABELS,
  badgeSvg,
  faviconSvg,
  INK_ON_DARK,
  INK_ON_LIGHT,
  MARK,
  macAppIconSvg,
  markSvg,
  PAPER,
  PAPER_EDGE,
  plateMarkSvg,
  pwaIconSvg,
  TEMPLATE,
} from './marks.ts';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'public');

// The ring's weight over its outer radius, read from a drawing's ring.
function weight(svg: string): number {
  const ring = /class="ring[^"]*"[^>]* r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/.exec(svg);
  const r = Number(ring?.[1]);
  const sw = Number(ring?.[2]);
  return sw / (r + sw / 2);
}

describe('markSvg', () => {
  it('shows a dot in every frame: ink at rest, blue while yours or while an agent works', () => {
    expect(markSvg('idle', 16, INK_ON_LIGHT)).toContain('class="dot rest"');
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

  it('keeps the dot top right at rest and while yours, and still frames of work bottom right', () => {
    // 16 grid: ring outer 6, weight 2.25, so the centre line is r 4.88
    expect(markSvg('idle', 16, INK_ON_LIGHT)).toContain('cx="11.45" cy="4.55"');
    expect(markSvg('yours', 16, INK_ON_LIGHT)).toContain('cx="11.45" cy="4.55"');
    expect(markSvg('working', 16, INK_ON_LIGHT)).toContain('cx="11.45" cy="11.45"');
  });

  it('grows the dot from rest to yours to working', () => {
    const r = (s: string) => Number(/class="dot[^"]*"[^>]* r="([\d.]+)"/.exec(s)?.[1]);
    const rest = r(markSvg('idle', 32, INK_ON_LIGHT));
    const yours = r(markSvg('yours', 32, INK_ON_LIGHT));
    expect(yours).toBeGreaterThan(rest);
    expect(r(markSvg('working', 32, INK_ON_LIGHT))).toBeGreaterThan(yours);
  });

  it('says yours with the dot in a template image, with no color', () => {
    expect(markSvg('yours', 16, TEMPLATE)).toContain('class="dot"');
    expect(markSvg('yours', 16, TEMPLATE)).not.toContain(MARK);
  });
});

describe('one ring weight everywhere', () => {
  const drawings: [string, string][] = [
    ...[16, 20, 24, 32, 40, 48, 64, 256, 512].map((size): [string, string] => [
      `app ${size}`,
      appIconSvg(size),
    ]),
    ['tray 16', markSvg('idle', 16, INK_ON_LIGHT)],
    ['tray 32', markSvg('yours', 32, INK_ON_LIGHT)],
    ['favicon', faviconSvg('idle')],
    ['linux plate', plateMarkSvg('idle')],
    ['mac', macAppIconSvg()],
    ['maskable', pwaIconSvg(512, 'maskable')],
    ['apple', pwaIconSvg(180, 'apple')],
  ];
  it.each(drawings)('%s has a ring about 0.37 of its outer radius', (_name, svg) => {
    expect(weight(svg)).toBeGreaterThanOrEqual(0.33);
    expect(weight(svg)).toBeLessThanOrEqual(0.4);
  });
});

describe('the favicons in ui/public', () => {
  it.each(['idle', 'yours', 'working', 'yours-working'] as const)('%s is faviconSvg', (frame) => {
    const file = readFileSync(join(PUBLIC, `otea-${frame}.svg`), 'utf8');
    expect(file.trim()).toBe(faviconSvg(frame).trim());
  });

  it('paints the ring and the resting dot from the colour scheme', () => {
    expect(faviconSvg('idle')).toContain('class="dot rest fill"');
    expect(faviconSvg('idle')).toMatch(/prefers-color-scheme:dark\)\{\.ink\{[^}]+\}\.fill\{/);
  });
});

describe('the app icon', () => {
  it('puts the blue dot on the app icon at every size', () => {
    for (const size of [16, 24, 32, 256]) expect(appIconSvg(size)).toContain(MARK);
    expect(macAppIconSvg()).toContain(MARK);
  });

  it("sits on a tile of the app's paper with a thin border", () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
    expect(PAPER).toBe(manifest.theme_color);
    for (const size of [16, 48, 256]) {
      expect(appIconSvg(size)).toContain(`fill="${PAPER}" stroke="${PAPER_EDGE}"`);
    }
    // one pixel, inset half a pixel, on the sizes Windows shows small: a single sharp line
    expect(appIconSvg(16)).toMatch(/class="tile" x="0.5"[^>]*stroke-width="1"/);
    expect(appIconSvg(48)).toMatch(/class="tile" x="2.5"[^>]*stroke-width="1"/);
  });

  it('draws the home-screen icons edge to edge, the maskable one inside the safe circle', () => {
    expect(pwaIconSvg(512, 'maskable')).toContain(`width="512" height="512" fill="${PAPER}"`);
    const ring = /ring"[^>]* cx="256" cy="256" r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/.exec(
      pwaIconSvg(512, 'maskable'),
    );
    expect(Number(ring?.[1]) + Number(ring?.[2]) / 2).toBeLessThanOrEqual(512 * 0.4);
  });
});

describe('badgeSvg', () => {
  it('is a blue disc with the count in white, never the mark', () => {
    for (const label of BADGE_LABELS) {
      const badge = badgeSvg(label);
      expect(badge).toContain(`>${label}</text>`);
      expect(badge).toContain('fill="#fff"');
      expect(badge).not.toContain('class="ring');
    }
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
