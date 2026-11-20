import { describe, expect, it } from 'vitest';
import {
  blurOf,
  CARRIED,
  carriedStyle,
  landedOn,
  moveOf,
  settleDelta,
  wrapWidth,
} from './morph-clone.ts';

// A computed style as Chrome gives it for a title in Pasos: the `font` shorthand comes back empty
// when a longhand it cannot spell (the optical size, the variation) is set.
const titleStyle = {
  font: '',
  fontFamily: '"Source Serif 4", Georgia, serif',
  fontSize: '15.5px',
  fontWeight: '430',
  fontStyle: 'normal',
  fontStretch: '100%',
  fontVariationSettings: '"opsz" 18',
  fontOpticalSizing: 'auto',
  lineHeight: '20.15px',
  letterSpacing: 'normal',
  color: 'rgb(30, 30, 30)',
  whiteSpace: 'normal',
  overflow: 'visible',
  textOverflow: 'clip',
  backgroundImage: 'linear-gradient(red, red)',
  boxShadow: 'none',
} as Record<string, string>;

describe('a travelling copy looks exactly like the piece it stands for', () => {
  it('carries the font by its longhands, never the shorthand Chrome leaves empty', () => {
    const s = carriedStyle(titleStyle);
    expect(s.fontFamily).toBe('"Source Serif 4", Georgia, serif');
    expect(s.fontWeight).toBe('430');
    expect(s.fontSize).toBe('15.5px');
    expect(s.fontVariationSettings).toBe('"opsz" 18');
    expect(s.lineHeight).toBe('20.15px');
    expect('font' in s).toBe(false);
  });

  it('carries how it wraps and clips, so it breaks its lines where the original does', () => {
    const s = carriedStyle({
      ...titleStyle,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    expect(s.whiteSpace).toBe('nowrap');
    expect(s.overflow).toBe('hidden');
    expect(s.textOverflow).toBe('ellipsis');
  });

  it('carries the paint a piece draws with (an edge is a dashed gradient, a glow is a shadow)', () => {
    expect(CARRIED).toContain('backgroundImage');
    expect(CARRIED).toContain('backgroundColor');
    expect(CARRIED).toContain('boxShadow');
    expect(carriedStyle(titleStyle).backgroundImage).toBe('linear-gradient(red, red)');
  });

  it('leaves out what the computed style does not have', () => {
    const s = carriedStyle({ fontFamily: 'serif' });
    expect(Object.keys(s)).toEqual(['fontFamily']);
  });
});

describe('a wrapping copy is as wide as the line it wraps in', () => {
  // It runs from where the text starts to the content edge of its block, never narrower than the
  // text itself. An inline title measures as wide as its longest line, which may break one word
  // sooner.
  it.each([
    [{ x: 316, w: 150 }, 487, 171],
    [{ x: 316, w: 180 }, 487, 180],
  ])('wraps %o within %d at %d', (text, edge, width) => {
    expect(wrapWidth(text, edge)).toBe(width);
  });
});

describe('a copy is set where its glyphs fall on the original', () => {
  // It moves by what separates its first line from the original first line, and not at all when
  // they already meet.
  it.each([
    [
      { x: 10, y: 20 },
      { x: 10, y: 17.5 },
      { dx: 0, dy: 2.5 },
    ],
    [
      { x: 4, y: 4 },
      { x: 4, y: 4 },
      { dx: 0, dy: 0 },
    ],
  ])('sets a copy of %o found at %o by %o', (original, copy, delta) => {
    expect(settleDelta(original, copy)).toEqual(delta);
  });
});

describe('a piece at rest carries no transform and no filter', () => {
  // A transform or a filter, even an identity one, lifts the piece onto a layer of its own that
  // the compositor snaps to whole pixels: at a fractional column it sits a fraction off, and
  // jumps when the morph hands it back.
  it('writes no blur when there is none to see', () => {
    expect(blurOf(0)).toBe('');
    expect(blurOf(0.004)).toBe('');
    expect(blurOf(0.7)).toBe('blur(0.7px)');
  });

  it('writes no transform when the piece is where it stands', () => {
    expect(moveOf(0, 0)).toBe('');
    expect(moveOf(0.001, -0.002, 1.00001)).toBe('');
    expect(moveOf(3, -2)).toBe('translate(3px, -2px)');
    expect(moveOf(0, 0, 0.9)).toBe('translate(0px, 0px) scale(0.9)');
  });
});

describe('a piece that lands is handed back at once', () => {
  // Its copy goes and the real piece shows in the frame it lands, so the morph's last frame is
  // made of the destination's own pieces, not of copies that only look like them.
  // It lands on the side the clock is going to, once its own clock is through, and is still
  // travelling until then.
  it.each([
    [1, 1, 1],
    [1, 0, 0],
    [0.999, 1, null],
    [0, 0, null],
  ] as const)('landedOn(%s, %s) is %s', (clock, side, landed) => {
    expect(landedOn(clock, side)).toBe(landed);
  });
});
