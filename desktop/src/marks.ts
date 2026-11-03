// The desktop drawings of the letter node, as SVG. Geometry from the design boards (Desk-App-Icon,
// Desk-Taskbar, Desk-Tray), the same numbers as the favicons in ui/public: on the 16 grid the ring is
// outer 7 at weight 3, working steps it in to 5/7 with the orbit at 7.25; on the 32 grid ring 13 / 6,
// working .7 with the orbit at 14. The orbit rests at 1 o'clock and steps 30° a frame.
import type { AttentionFrame } from '../../ui/src/attention.ts';

export type Grid = 16 | 32;
export type Ink = { ink: string; you: string };

export const INK_ON_LIGHT: Ink = { ink: '#1b1f29', you: '#3b5bff' };
export const INK_ON_DARK: Ink = { ink: '#e5e8ed', you: '#3b5bff' };
// A template image: macOS keeps only the alpha and paints it in the menu bar's ink.
export const TEMPLATE: Ink = { ink: '#000', you: '#000' };

const PLATE = 'oklch(0.95 0.006 265)';
const PLATE_EDGE = 'oklch(0.8 0.012 265)';
const PLATE_INK = 'oklch(0.24 0.02 265)';
const ON_PLATE: Ink = { ink: PLATE_INK, you: INK_ON_LIGHT.you };

export const FRAMES = 12;
export const FRAME_MS = 142; // 12 frames a turn, a turn every 1.7s

const LIVE = {
  32: { R: 13, sw: 6, s: 0.7, or: 14, osw: 1.75 },
  16: { R: 7, sw: 3, s: 5 / 7, or: 7.25, osw: 1.5 },
} as const;

const n = (v: number) => +v.toFixed(2);

const ring = (c: number, rOut: number, sw: number, color: string) =>
  `<circle cx="${n(c)}" cy="${n(c)}" r="${n(rOut - sw / 2)}" fill="none" stroke="${color}" stroke-width="${n(sw)}"/>`;
const disc = (c: number, r: number, color: string) =>
  `<circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" fill="${color}"/>`;
function orbitArc(c: number, r: number, sw: number, from: number, color: string): string {
  const a0 = (from * Math.PI) / 180;
  const a1 = ((from + 90) * Math.PI) / 180;
  const at = (a: number) => `${n(c + r * Math.cos(a))} ${n(c + r * Math.sin(a))}`;
  return `<path d="M${at(a0)} A${n(r)} ${n(r)} 0 0 1 ${at(a1)}" fill="none" stroke="${color}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
}

export const svg = (G: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${G}" viewBox="0 0 ${G} ${G}">${inner}</svg>`;

const working = (frame: AttentionFrame) => frame === 'working' || frame === 'yours-working';
const filled = (frame: AttentionFrame) => frame === 'yours' || frame === 'yours-working';

// The living mark in one frame. `step` turns the orbit (0 is the still frame, at 1 o'clock). In
// color the counter is your blue inside the ink ring; as a template, with no color to say "yours",
// the whole node is filled.
export function markSvg(frame: AttentionFrame, G: Grid, ink: Ink, step = 0): string {
  const g = LIVE[G];
  const c = G / 2;
  const s = working(frame) ? g.s : 1;
  const R = g.R * s;
  const sw = g.sw * s;
  let inner = working(frame) ? orbitArc(c, g.or, g.osw, -80 + 30 * step, ink.ink) : '';
  if (ink === TEMPLATE) inner += filled(frame) ? disc(c, R, ink.ink) : ring(c, R, sw, ink.ink);
  else inner += (filled(frame) ? disc(c, R - sw / 2, ink.you) : '') + ring(c, R, sw, ink.ink);
  return svg(G, inner);
}

// Linux panels come in every color and have no template images: the mark sits on the overlay's
// round plate. Always the still frame.
export function plateMarkSvg(frame: AttentionFrame): string {
  const body = markSvg(frame, 32, ON_PLATE).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return svg(
    32,
    `<circle cx="16" cy="16" r="15.5" fill="${PLATE}" stroke="${PLATE_EDGE}" stroke-width="1"/>${body}`,
  );
}

// The Windows taskbar overlay: a round plate holding the filled node (yours) or a smaller ring with
// its orbit, still (working). Never animated.
export function overlaySvg(kind: 'yours' | 'working', G: Grid): string {
  const c = G / 2;
  const k = G / 16;
  let inner = `<circle cx="${c}" cy="${c}" r="${n(c - 0.5 * k)}" fill="${PLATE}" stroke="${PLATE_EDGE}" stroke-width="${n(k)}"/>`;
  if (kind === 'yours')
    inner += disc(c, 6 * k - k, ON_PLATE.you) + ring(c, 6 * k, 2 * k, PLATE_INK);
  else inner += orbitArc(c, 6 * k, 1.5 * k, -80, PLATE_INK) + ring(c, 4 * k, 1.75 * k, PLATE_INK);
  return svg(G, inner);
}

// The app icon: the hollow letter node on a light plate, the same file on every ground. Static and
// never blue. Each size has its own ring (outer radius / weight) so every edge lands on a pixel.
export const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 256] as const;
const HINT: Record<number, [number, number]> = {
  16: [5, 2],
  20: [6, 3],
  24: [8, 4],
  32: [10, 5],
  40: [13, 6],
  48: [15, 7],
  64: [20, 9],
  256: [80, 36],
  512: [160, 72],
};

export function appIconSvg(S: number): string {
  const [R, sw] = HINT[S] ?? [S * 0.3125, S * 0.14];
  const m = S <= 24 ? 0 : S / 16;
  const w = S - 2 * m;
  const plate = `<rect x="${n(m)}" y="${n(m)}" width="${n(w)}" height="${n(w)}" rx="${n(w * 0.22)}" fill="${PLATE}"/>`;
  return svg(S, plate + ring(S / 2, R, sw, PLATE_INK));
}

// macOS: Apple's 1024 grid, the 824 shape at 100 with a ~185.4 corner, the ring outer 262 at 118.
export function macAppIconSvg(): string {
  const plate = `<rect x="100" y="100" width="824" height="824" rx="185.4" fill="${PLATE}"/>`;
  return svg(1024, plate + ring(512, 262, 118, PLATE_INK));
}
