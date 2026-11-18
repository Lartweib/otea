// The image files that ship with Otea, all drawn by marks.ts: the favicons and home-screen icons in
// ui/public, and what electron-builder puts on Otea.exe, its shortcut and its installer (a .ico with
// every size Windows asks for, each hinted on its own grid) and on the Mac app. scripts/render-icons.mjs
// writes them; build/icons.json records a hash of the drawings each came from, so a test notices a
// drawing changed without its files being rendered again.
import { createHash } from 'node:crypto';
import type { AttentionFrame } from '../../ui/src/attention.ts';
import { appIconSvg, faviconSvg, ICON_SIZES, macAppIconSvg, pwaIconSvg } from './marks.ts';

// A file: where it goes (from the repository's root) and what it is made of. A .svg is the drawing
// itself; a .png is one drawing at one size; a .ico is one drawing per size.
export type IconFile =
  | { path: string; kind: 'svg'; svg: string }
  | { path: string; kind: 'png'; svg: string; size: number }
  | { path: string; kind: 'ico'; images: { svg: string; size: number }[] };

const FRAMES: AttentionFrame[] = ['idle', 'yours', 'working', 'yours-working'];

export const ICON_FILES: IconFile[] = [
  ...FRAMES.map(
    (frame): IconFile => ({
      path: `ui/public/otea-${frame}.svg`,
      kind: 'svg',
      svg: faviconSvg(frame),
    }),
  ),
  { path: 'ui/public/icons/otea-192.png', kind: 'png', svg: pwaIconSvg(192, 'any'), size: 192 },
  { path: 'ui/public/icons/otea-512.png', kind: 'png', svg: pwaIconSvg(512, 'any'), size: 512 },
  {
    path: 'ui/public/icons/otea-maskable-512.png',
    kind: 'png',
    svg: pwaIconSvg(512, 'maskable'),
    size: 512,
  },
  {
    path: 'ui/public/icons/apple-touch-icon.png',
    kind: 'png',
    svg: pwaIconSvg(180, 'apple'),
    size: 180,
  },
  {
    path: 'desktop/build/icon.ico',
    kind: 'ico',
    images: ICON_SIZES.map((size) => ({ svg: appIconSvg(size), size })),
  },
  { path: 'desktop/build/icon.png', kind: 'png', svg: macAppIconSvg(), size: 1024 },
];

export const ICONS_RECORD = 'desktop/build/icons.json';

// The hash of what a file is drawn from.
export function sourceHash(file: IconFile): string {
  const parts =
    file.kind === 'ico'
      ? file.images.map(({ svg, size }) => `${size}:${svg}`)
      : file.kind === 'png'
        ? [`${file.size}:${file.svg}`]
        : [file.svg];
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

export function iconsRecord(): Record<string, string> {
  return Object.fromEntries(ICON_FILES.map((file) => [file.path, sourceHash(file)]));
}
