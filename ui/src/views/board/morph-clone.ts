// The morph's travelling copies (morph-run.ts). A copy lives in the overlay, out of the rules that
// styled its original, so it carries the original's computed look inline: the font by its
// longhands (Chrome leaves the `font` shorthand empty once an optical size or a variation is set,
// and a copy given '' falls back to the overlay's sans), how it wraps and clips, and the paint it
// draws with. Then it is set where the original's glyphs fall, so the morph's last frame is the
// destination itself and nothing moves when the copies go.

export const CARRIED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'fontVariantCaps',
  'fontVariantNumeric',
  'fontVariantLigatures',
  'fontFeatureSettings',
  'fontVariationSettings',
  'fontOpticalSizing',
  'fontKerning',
  'fontSynthesis',
  'letterSpacing',
  'wordSpacing',
  'lineHeight',
  'textTransform',
  'textAlign',
  'textDecorationLine',
  'textDecorationColor',
  'textDecorationThickness',
  'textUnderlineOffset',
  'color',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'overflow',
  'textOverflow',
  'backgroundColor',
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
  'backgroundRepeat',
  'boxShadow',
  'borderRadius',
] as const;

export type Carried = (typeof CARRIED)[number];

export function carriedStyle(
  cs: Partial<Record<string, string>>,
): Partial<Record<Carried, string>> {
  const out: Partial<Record<Carried, string>> = {};
  for (const k of CARRIED) {
    const v = cs[k];
    if (v) out[k] = v;
  }
  return out;
}

// An inline piece measures as wide as its longest line; given only that, a copy may break a word
// sooner. Its line runs to the content edge of the block it wraps in.
export function wrapWidth(r: { x: number; w: number }, contentRight: number): number {
  return Math.max(r.w, contentRight - r.x);
}

export function settleDelta(
  original: { x: number; y: number },
  copy: { x: number; y: number },
): { dx: number; dy: number } {
  return { dx: original.x - copy.x, dy: original.y - copy.y };
}

// A piece at rest writes no filter and no transform: even an identity one lifts it onto a layer
// the compositor snaps to whole pixels, a fraction off where it lands in flow.
export function blurOf(b: number): string {
  return b < 0.01 ? '' : `blur(${Math.round(b * 100) / 100}px)`;
}

export function moveOf(dx: number, dy: number, s = 1): string {
  const still = Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01;
  const whole = Math.abs(s - 1) < 1e-4;
  if (still && whole) return '';
  return whole ? `translate(${dx}px, ${dy}px)` : `translate(${dx}px, ${dy}px) scale(${s})`;
}

// Through its own clock, a piece has landed on the side the clock goes to: its copy hands over to
// the real piece there.
export function landedOn(raw: number, target: 0 | 1): 0 | 1 | null {
  return raw >= 1 ? target : null;
}

// ---- the DOM side ----

const INLINE = new Set(['inline', 'contents']);

// The first line box of an element's text, where its glyphs are.
function firstLine(el: Element): DOMRect | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = [...range.getClientRects()].find((x) => x.width > 0 || x.height > 0);
  range.detach();
  return r ?? null;
}

// Where an element's first glyph is drawn: its first line box, or its own box if it has no text.
export function glyphOf(el: Element): DOMRect {
  return firstLine(el) ?? el.getBoundingClientRect();
}

function contentRight(el: HTMLElement): number {
  let box: HTMLElement | null = el.parentElement;
  while (box && INLINE.has(getComputedStyle(box).display)) box = box.parentElement;
  if (!box) return el.getBoundingClientRect().right;
  const cs = getComputedStyle(box);
  return (
    box.getBoundingClientRect().right -
    parseFloat(cs.paddingRight || '0') -
    parseFloat(cs.borderRightWidth || '0')
  );
}

export type Box = { x: number; y: number; w: number; h: number };

// A copy of `src` in `layer`, at the box `r` (in the layer's coordinates), that looks like it.
// `wrap` asks for the width of the line it wraps in rather than its own measure.
export function copyOf(
  src: HTMLElement,
  r: Box,
  layer: HTMLElement,
  o: { wrap?: boolean; extra?: string } = {},
): HTMLElement {
  const c = src.cloneNode(true) as HTMLElement;
  const cs = getComputedStyle(src);
  Object.assign(c.style, carriedStyle(cs as unknown as Record<string, string>));
  const inline = INLINE.has(cs.display);
  const left = src.getBoundingClientRect().left;
  const width = o.wrap && inline ? wrapWidth({ x: left, w: r.w }, contentRight(src)) : r.w;
  Object.assign(c.style, {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${width}px`,
    visibility: 'visible',
    padding: inline ? '0' : cs.padding,
    boxSizing: cs.boxSizing,
  });
  if (!inline) c.style.height = `${r.h}px`;
  c.removeAttribute('data-s');
  for (const k of c.querySelectorAll('[data-s]')) k.removeAttribute('data-s');
  if (o.extra) c.style.cssText += o.extra;
  layer.appendChild(c);
  // Set the copy where the original's glyphs fall.
  const a = firstLine(src);
  const b = firstLine(c);
  if (a && b) {
    const d = settleDelta({ x: a.left, y: a.top }, { x: b.left, y: b.top });
    if (d.dx || d.dy) {
      c.style.left = `${r.x + d.dx}px`;
      c.style.top = `${r.y + d.dy}px`;
    }
  }
  return c;
}
