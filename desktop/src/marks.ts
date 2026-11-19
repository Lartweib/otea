// The one drawing of the mark, as SVG: Órbita, the o of "otea" as a ring with a dot on it (the icon
// review's A · Órbita afinada). Every image the app, the installer and the home screen show is drawn
// here and nowhere else: the shell rasterizes it at start-up (icons.ts) and scripts/render-icons.ts
// writes the files that ship (ui/public/icons, desktop/build).
//
// One ring weight everywhere: about 0.37 of the ring's outer radius. The dot sits on the ring at 45°
// up and right, cut out of it by a gap of the ground. In the tray and the favicon the dot is there
// at rest too, in ink, so the mark is always recognisable; it turns blue while something waits for
// you, and while an agent works it grows, moves to 45° down and right, a trail of 45° follows it and
// it turns, a step of 30° a frame. The app icon is the ring with its blue dot on a tile the colour
// of the app's paper (--ground) with a thin border, so it holds on a light taskbar as on a dark one.
import type { AttentionFrame } from '../../ui/src/attention.ts';

export type Grid = 16 | 32;
export type Ink = { ink: string; you: string };

// The brand's blue, oklch(0.6 0.21 266) (--mark-you): one value on every ground, because the dot is
// read against the ring around it, not against the page.
export const MARK = '#4473fb';
// The app's paper (--ground, light) and ink (--ink, light), and the tile's thin border.
export const PAPER = '#f7f8fc';
export const PAPER_INK = '#1b1f29';
export const PAPER_EDGE = '#c9cfdb';

export const INK_ON_LIGHT: Ink = { ink: PAPER_INK, you: MARK };
export const INK_ON_DARK: Ink = { ink: '#e5e8ed', you: MARK };
// A template image: macOS keeps only the alpha and paints it in the menu bar's ink.
export const TEMPLATE: Ink = { ink: '#000', you: '#000' };
const ON_PAPER: Ink = { ink: PAPER_INK, you: MARK };

// The ring's weight over its outer radius, everywhere the mark is drawn.
export const WEIGHT = 0.37;

export const FRAMES = 12;
export const FRAME_MS = 217; // 12 frames a turn, a turn every 2.6s

const n = (v: number) => +v.toFixed(2);

export const svg = (G: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${G}" viewBox="0 0 ${G} ${G}">${inner}</svg>`;

const working = (frame: AttentionFrame) => frame === 'working' || frame === 'yours-working';

// A ring: its centre, outer radius and weight. The dot's radius and the gap around it are in
// fractions of the outer radius.
type Ring = { c: number; outer: number; sw: number };
type Dot = { angle: number; r: number; gap: number; paint: 'ink' | 'you'; trail: boolean };

// Where the dot sits: up and right at rest and while yours, down and right while an agent works.
const STILL = -45;
const AT_WORK = 45;
const STEP = 30;
const TRAIL = 45;

// The tray's and the favicon's dot, from the review's 100 grid (ring outer 37): an ink dot of 8 at
// rest, a blue one of 12 while yours, 13 while an agent works; the cut 16, 16 and 18.
const GLYPH_DOT = {
  idle: { r: 8 / 37, gap: 8 / 37 },
  yours: { r: 12 / 37, gap: 4 / 37 },
  working: { r: 13 / 37, gap: 5 / 37 },
} as const;

function dotOf(frame: AttentionFrame, step: number): Dot {
  if (working(frame))
    return { angle: AT_WORK + STEP * step, ...GLYPH_DOT.working, paint: 'you', trail: true };
  if (frame === 'yours') return { angle: STILL, ...GLYPH_DOT.yours, paint: 'you', trail: false };
  return { angle: STILL, ...GLYPH_DOT.idle, paint: 'ink', trail: false };
}

// The ring with the dot cut out of it (and its trail, while working). `paintClass` paints ring and
// ink dot from classes instead of the ink, as a favicon does to follow the colour scheme.
function orbita(ring: Ring, ink: Ink, dot: Dot, id = 'cut', paintClass = ''): string {
  const r = ring.outer - ring.sw / 2;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [n(ring.c + r * Math.cos(a)), n(ring.c + r * Math.sin(a))] as const;
  };
  const [x, y] = at(dot.angle);
  const dotR = dot.r * ring.outer;
  const cut = dotR + dot.gap * ring.outer;
  const stroke = paintClass ? `class="ring ${paintClass}"` : `class="ring" stroke="${ink.ink}"`;
  let body = `<circle ${stroke} cx="${n(ring.c)}" cy="${n(ring.c)}" r="${n(r)}" fill="none" stroke-width="${n(ring.sw)}"/>`;
  if (dot.trail) {
    const [x0, y0] = at(dot.angle - TRAIL);
    body += `<path class="trail" d="M${x0} ${y0} A${n(r)} ${n(r)} 0 0 1 ${x} ${y}" fill="none" stroke="${ink.you}" stroke-opacity="0.55" stroke-width="${n(ring.sw)}"/>`;
  }
  // The mask's region in the drawing's own units, a pixel past the ring: by default it is the ring's
  // box plus 10%, which leaves out the outer half of the stroke and cut the ring flat on all four
  // sides (P5-R2-1).
  const lo = n(ring.c - ring.outer - 1);
  const span = n(2 * (ring.outer + 1));
  const box = `x="${lo}" y="${lo}" width="${span}" height="${span}"`;
  const mask = `<mask id="${id}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/><circle cx="${x}" cy="${y}" r="${n(cut)}" fill="#000"/></mask>`;
  const paint =
    dot.paint === 'you'
      ? `class="dot" fill="${ink.you}"`
      : paintClass
        ? `class="dot rest fill"`
        : `class="dot rest" fill="${ink.ink}"`;
  return `<defs>${mask}</defs><g mask="url(#${id})">${body}</g><circle ${paint} cx="${x}" cy="${y}" r="${n(dotR)}"/>`;
}

// The tray glyph on each grid: the ring's outer radius and weight, set so its outer edge lands on a
// pixel. About 37% of the grid, as the review's 100 grid (outer 37, weight 14).
const GLYPH: Record<Grid, { outer: number; sw: number }> = {
  16: { outer: 6, sw: 2.25 },
  32: { outer: 12, sw: 4.5 },
};

const glyphRing = (G: Grid): Ring => ({ c: G / 2, ...GLYPH[G] });

// The living mark in one frame. `step` turns the dot and its trail (0 is the still frame).
export function markSvg(frame: AttentionFrame, G: Grid, ink: Ink, step = 0): string {
  return svg(G, orbita(glyphRing(G), ink, dotOf(frame, step)));
}

// The tab's favicon in one frame: ring and ink dot follow the browser's colour scheme, the blue dot
// is the brand's. A favicon is a file, so work shows its still frame.
export function faviconSvg(frame: AttentionFrame): string {
  const style = `<style>.ink{stroke:${PAPER_INK}}.fill{fill:${PAPER_INK}}@media (prefers-color-scheme:dark){.ink{stroke:${INK_ON_DARK.ink}}.fill{fill:${INK_ON_DARK.ink}}}</style>`;
  const body = orbita(glyphRing(16), INK_ON_LIGHT, dotOf(frame, 0), 'cut', 'ink');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <title>Otea</title>
  ${style}
  ${body}
</svg>
`;
}

// Linux panels come in every colour and have no template images: the glyph sits on a round plate
// of paper with the tile's border. Always the still frame.
export function plateMarkSvg(frame: AttentionFrame): string {
  const plate = `<circle cx="16" cy="16" r="15.5" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="1"/>`;
  const ring: Ring = { c: 16, outer: 10, sw: 3.75 };
  return svg(32, plate + orbita(ring, ON_PAPER, dotOf(frame, 0)));
}

// The Windows taskbar's count of what is yours: a blue disc with the number in white, drawn over
// the button's corner. Not a second mark: the icon under it is already Otea. One or two characters
// ("1" to "9", "9+"), in the system's face, on the 16 grid scaled to the size asked for. The disc is
// the blue a step deeper than the dot, so white on it reads at 5:1.
export const BADGE = '#3a63f0';
export const BADGE_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9+'] as const;
export type BadgeLabel = (typeof BADGE_LABELS)[number];

export function badgeSvg(label: BadgeLabel): string {
  const size = label.length > 1 ? 8.5 : 11;
  const text = `<text x="8" y="8" dy="0.36em" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${size}" letter-spacing="${label.length > 1 ? -0.3 : 0}" fill="#fff">${label}</text>`;
  return svg(16, `<circle class="badge" cx="8" cy="8" r="8" fill="${BADGE}"/>${text}`);
}

// The app icon's dot: blue, a third of the ring's outer radius, cut out by a gap of paper.
const ICON_DOT: Dot = { angle: STILL, r: 0.35, gap: 0.16, paint: 'you', trail: false };

// The app icon at each size. Up to 32 the tile fills the square (the review's small tile); from 40
// it leaves a margin of 5% (its large tile). Each size has its own ring (outer radius, weight) so
// every edge lands on a pixel, and a 1px border inset half a pixel so it stays one sharp line.
export const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 256] as const;
const HINT: Record<number, { outer: number; sw: number }> = {
  16: { outer: 5.5, sw: 2 },
  20: { outer: 7, sw: 2.5 },
  24: { outer: 8, sw: 3 },
  32: { outer: 11, sw: 4 },
  40: { outer: 12, sw: 4.5 },
  48: { outer: 14, sw: 5.25 },
  64: { outer: 19, sw: 7 },
  256: { outer: 75.5, sw: 28 },
};

function tile(S: number): { x: number; w: number; edge: number } {
  if (S <= 32) return { x: 0.5, w: S - 1, edge: 1 };
  const edge = S >= 128 ? n(S * 0.016) : 1;
  const x = Math.round(S * 0.05) + edge / 2;
  return { x, w: S - 2 * x, edge };
}

export function appIconSvg(S: number): string {
  const small = S <= 32;
  const ring: Ring = {
    c: S / 2,
    ...(HINT[S] ?? { outer: S * (small ? 0.34 : 0.295), sw: S * (small ? 0.34 : 0.295) * WEIGHT }),
  };
  const t = tile(S);
  const plate = `<rect class="tile" x="${n(t.x)}" y="${n(t.x)}" width="${n(t.w)}" height="${n(t.w)}" rx="${n(t.w * 0.23)}" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="${n(t.edge)}"/>`;
  return svg(S, plate + orbita(ring, ON_PAPER, ICON_DOT));
}

// macOS: Apple's 1024 grid, the 824 shape at 100 with a ~185.4 corner, the ring a third of it.
export function macAppIconSvg(): string {
  const plate = `<rect class="tile" x="100" y="100" width="824" height="824" rx="185.4" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="6"/>`;
  const outer = 824 * (29.5 / 90);
  return svg(1024, plate + orbita({ c: 512, outer, sw: outer * WEIGHT }, ON_PAPER, ICON_DOT));
}

// The home-screen icons (ui/public/icons): 'any' is the app icon; 'maskable' and 'apple' fill the
// square edge to edge with paper (the system rounds or masks it), the mark inside the maskable safe
// circle.
export function pwaIconSvg(S: number, kind: 'any' | 'maskable' | 'apple'): string {
  if (kind === 'any') return appIconSvg(S);
  const plate = `<rect width="${S}" height="${S}" fill="${PAPER}"/>`;
  const outer = S * (kind === 'maskable' ? 0.26 : 0.31);
  return svg(S, plate + orbita({ c: S / 2, outer, sw: outer * WEIGHT }, ON_PAPER, ICON_DOT));
}
