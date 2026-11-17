// The desktop drawings of the mark, as SVG: Órbita, the o of "otea" as a ring with a blue dot on
// it. Geometry from the logo board (C · Órbita): on a 100 grid the ring's centre line is r 37 at
// weight 13 and the dot r 13 sits on it at 45° up and right, cut out of the ring by a gap of 3.5.
// The dot shows while something waits for you or an agent works; while one works it grows by 22%,
// a trail of 80° follows it at half strength, and it turns, a step of 30° a frame. A still frame of
// work rests at 45° down and right, so a static image still says "working". The same numbers draw
// the favicons in ui/public (faviconSvg) and the home-screen icons (pwaIconSvg).
import type { AttentionFrame } from '../../ui/src/attention.ts';

export type Grid = 16 | 32;
export type Ink = { ink: string; you: string };

// The brand's blue, oklch(0.6 0.21 266): one value on every ground, because the dot is read against
// the ring around it, not against the page.
export const MARK = '#4473fb';

export const INK_ON_LIGHT: Ink = { ink: '#1b1f29', you: MARK };
export const INK_ON_DARK: Ink = { ink: '#e5e8ed', you: MARK };
// A template image: macOS keeps only the alpha and paints it in the menu bar's ink.
export const TEMPLATE: Ink = { ink: '#000', you: '#000' };

const PLATE = 'oklch(0.95 0.006 265)';
const PLATE_EDGE = 'oklch(0.8 0.012 265)';
const PLATE_INK = 'oklch(0.24 0.02 265)';
const ON_PLATE: Ink = { ink: PLATE_INK, you: MARK };
const IN_INK: Ink = { ink: PLATE_INK, you: PLATE_INK };

export const FRAMES = 12;
export const FRAME_MS = 217; // 12 frames a turn, a turn every 2.6s

// Each grid's ring (centre line, weight) and dot (radius, gap), set so the ring's outer edge lands
// on a pixel: 7 on the 16 grid, 14 on the 32 grid.
const LIVE = {
  16: { r: 6, sw: 2, dot: 2.1, gap: 0.9 },
  32: { r: 12, sw: 4, dot: 4.2, gap: 1.8 },
} as const;

const GROW = 1.22;
const TRAIL = 80;
const STILL = -45;
const AT_WORK = 45;
const STEP = 30;

const n = (v: number) => +v.toFixed(2);

export const svg = (G: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${G}" viewBox="0 0 ${G} ${G}">${inner}</svg>`;

const working = (frame: AttentionFrame) => frame === 'working' || frame === 'yours-working';

type Shape = { c: number; r: number; sw: number; dot: number; gap: number };

// The ring, and when the dot shows, the dot at `angle` cut out of the ring (and its trail, while
// working). `ringClass` paints the ring from a class instead of the ink, as a favicon does.
function orbita(
  s: Shape,
  ink: Ink,
  dot: { angle: number; working: boolean } | null,
  ringClass = '',
  id = 'cut',
): string {
  const paint = ringClass ? `class="ring ${ringClass}"` : `class="ring"`;
  const stroke = ringClass ? '' : ` stroke="${ink.ink}"`;
  const ring = `<circle ${paint} cx="${n(s.c)}" cy="${n(s.c)}" r="${n(s.r)}" fill="none"${stroke} stroke-width="${n(s.sw)}"/>`;
  if (!dot) return ring;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [n(s.c + s.r * Math.cos(a)), n(s.c + s.r * Math.sin(a))] as const;
  };
  const [x, y] = at(dot.angle);
  const r = dot.working ? s.dot * GROW : s.dot;
  const mask = `<mask id="${id}"><rect width="100%" height="100%" fill="#fff"/><circle cx="${x}" cy="${y}" r="${n(r + s.gap)}" fill="#000"/></mask>`;
  let cut = ring;
  if (dot.working) {
    const [x0, y0] = at(dot.angle - TRAIL);
    cut += `<path class="trail" d="M${x0} ${y0} A${n(s.r)} ${n(s.r)} 0 0 1 ${x} ${y}" fill="none" stroke="${ink.you}" stroke-opacity="0.5" stroke-width="${n(s.sw)}"/>`;
  }
  return `<defs>${mask}</defs><g mask="url(#${id})">${cut}</g><circle class="dot" cx="${x}" cy="${y}" r="${n(r)}" fill="${ink.you}"/>`;
}

const dotOf = (frame: AttentionFrame, step: number) =>
  frame === 'idle'
    ? null
    : working(frame)
      ? { angle: AT_WORK + STEP * step, working: true }
      : { angle: STILL, working: false };

const shapeOn = (G: Grid): Shape => ({ c: G / 2, ...LIVE[G] });

// The living mark in one frame. `step` turns the dot and its trail (0 is the still frame).
export function markSvg(frame: AttentionFrame, G: Grid, ink: Ink, step = 0): string {
  return svg(G, orbita(shapeOn(G), ink, dotOf(frame, step)));
}

// The tab's favicon in one frame: the ring follows the browser's colour scheme, the dot is the
// brand's blue. A favicon is a file, so work shows its still frame.
export function faviconSvg(frame: AttentionFrame): string {
  const style =
    '<style>.ink{stroke:#1b1f29}@media (prefers-color-scheme:dark){.ink{stroke:#e5e8ed}}</style>';
  const body = orbita(shapeOn(16), INK_ON_LIGHT, dotOf(frame, 0), 'ink');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <title>Otea</title>
  ${style}
  ${body}
</svg>
`;
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

// The Windows taskbar overlay: a round plate holding the ring with the blue dot (yours) or with an
// ink dot and its trail at rest (working). Never animated.
export function overlaySvg(kind: 'yours' | 'working', G: Grid): string {
  const c = G / 2;
  const k = G / 16;
  const plate = `<circle cx="${c}" cy="${c}" r="${n(c - 0.5 * k)}" fill="${PLATE}" stroke="${PLATE_EDGE}" stroke-width="${n(k)}"/>`;
  const shape: Shape = { c, r: 4.75 * k, sw: 1.5 * k, dot: 1.75 * k, gap: 0.75 * k };
  const dot =
    kind === 'yours' ? { angle: STILL, working: false } : { angle: AT_WORK, working: true };
  return svg(G, plate + orbita(shape, kind === 'yours' ? ON_PLATE : IN_INK, dot));
}

// The app icon: the ring with its blue dot on a light plate, the same file on every ground. Static.
// Each size has its own ring (outer radius / weight) so every edge lands on a pixel.
export const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 256] as const;
const HINT: Record<number, [number, number]> = {
  16: [6, 2],
  20: [7.5, 2.5],
  24: [9, 3],
  32: [11, 3.5],
  40: [13.5, 4],
  48: [16, 5],
  64: [21, 6],
  256: [80, 24],
  512: [160, 48],
};

// The ring from its outer radius and weight; the dot and the gap in the board's proportions.
const fromOuter = (c: number, outer: number, sw: number): Shape => ({
  c,
  r: outer - sw / 2,
  sw,
  dot: outer * (13 / 43.5),
  gap: outer * (3.5 / 43.5),
});

export function appIconSvg(S: number): string {
  const [outer, sw] = HINT[S] ?? [S * 0.3125, S * 0.094];
  const m = S <= 24 ? 0 : S / 16;
  const w = S - 2 * m;
  const plate = `<rect x="${n(m)}" y="${n(m)}" width="${n(w)}" height="${n(w)}" rx="${n(w * 0.22)}" fill="${PLATE}"/>`;
  return svg(S, plate + orbita(fromOuter(S / 2, outer, sw), ON_PLATE, dotOf('yours', 0)));
}

// macOS: Apple's 1024 grid, the 824 shape at 100 with a ~185.4 corner, the ring outer 262.
export function macAppIconSvg(): string {
  const plate = `<rect x="100" y="100" width="824" height="824" rx="185.4" fill="${PLATE}"/>`;
  return svg(1024, plate + orbita(fromOuter(512, 262, 78), ON_PLATE, dotOf('yours', 0)));
}

// The home-screen icons (ui/public/icons): 'any' is the app icon; 'maskable' and 'apple' fill the
// square edge to edge (the system rounds or masks it), the mark inside the maskable safe circle.
export function pwaIconSvg(S: number, kind: 'any' | 'maskable' | 'apple'): string {
  if (kind === 'any') return appIconSvg(S);
  const plate = `<rect width="${S}" height="${S}" fill="${PLATE}"/>`;
  const outer = S * (kind === 'maskable' ? 0.27 : 0.3125);
  return svg(S, plate + orbita(fromOuter(S / 2, outer, outer * 0.3), ON_PLATE, dotOf('yours', 0)));
}
