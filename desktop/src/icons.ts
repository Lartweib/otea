// Every image the shell shows, rendered once at start-up from marks.ts. Windows gets .ico files (one
// per drawing, each size hinted on its own grid) because Windows picks the size per DPI from an .ico;
// macOS gets template images at @1x and @2x; Linux gets still PNGs on a plate.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type NativeImage, nativeImage } from 'electron';
import type { AttentionFrame } from '../../ui/src/attention.ts';
import { encodeIco } from './ico.ts';
import {
  appIconSvg,
  FRAMES,
  type Grid,
  ICON_SIZES,
  INK_ON_DARK,
  INK_ON_LIGHT,
  type Ink,
  macAppIconSvg,
  markSvg,
  overlaySvg,
  plateMarkSvg,
  TEMPLATE,
} from './marks.ts';
import { type RasterJob, rasterize } from './raster.ts';

export type Theme = 'light' | 'dark';

export type Icons = {
  app: NativeImage;
  // The tray in a frame; `step` turns the orbit (Windows and macOS animate, Linux stays still).
  tray(frame: AttentionFrame, theme: Theme, step: number): NativeImage;
  overlay: Record<'yours' | 'working', NativeImage>;
  menuYours(theme: Theme): NativeImage;
};

const ALL_FRAMES: AttentionFrame[] = ['idle', 'yours', 'working', 'yours-working'];
const animated = (frame: AttentionFrame) => frame === 'working' || frame === 'yours-working';
const stepsOf = (frame: AttentionFrame) => (animated(frame) ? FRAMES : 1);
const key = (frame: AttentionFrame, theme: Theme, step: number) => `${frame}.${theme}.${step}`;

// A batch of drawings to rasterize, each asked for under a name.
class Batch {
  readonly jobs: RasterJob[] = [];
  private readonly names: string[] = [];
  add(name: string, svg: string, size: number) {
    this.names.push(name);
    this.jobs.push({ svg, size });
  }
  async run(): Promise<Map<string, Buffer>> {
    const pngs = await rasterize(this.jobs);
    return new Map(this.names.map((name, index) => [name, pngs[index] as Buffer]));
  }
}

function fromScales(reps: readonly [number, Buffer][]): NativeImage {
  const image = nativeImage.createEmpty();
  for (const [scaleFactor, buffer] of reps) image.addRepresentation({ scaleFactor, buffer });
  return image;
}

function writeIco(dir: string, name: string, pngs: Map<string, Buffer>, sizes: [string, number][]) {
  const path = join(dir, `${name}.ico`);
  writeFileSync(
    path,
    encodeIco(sizes.map(([png, size]) => ({ size, png: pngs.get(png) as Buffer }))),
  );
  return nativeImage.createFromPath(path);
}

// Windows tray sizes: 16, 20, 24 and 32 (100, 125, 150 and 200%); up to 24 from the 16 grid.
const TRAY_SIZES: [number, Grid][] = [
  [16, 16],
  [20, 16],
  [24, 16],
  [32, 32],
];

async function windowsIcons(dir: string): Promise<Icons> {
  const batch = new Batch();
  for (const size of ICON_SIZES) batch.add(`app.${size}`, appIconSvg(size), size);
  for (const kind of ['yours', 'working'] as const) {
    batch.add(`overlay.${kind}.16`, overlaySvg(kind, 16), 16);
    batch.add(`overlay.${kind}.24`, overlaySvg(kind, 32), 24);
    batch.add(`overlay.${kind}.32`, overlaySvg(kind, 32), 32);
  }
  const inks: [Theme, Ink][] = [
    ['light', INK_ON_LIGHT],
    ['dark', INK_ON_DARK],
  ];
  for (const [theme, ink] of inks) {
    batch.add(`menu.${theme}.16`, markSvg('yours', 16, ink), 16);
    batch.add(`menu.${theme}.32`, markSvg('yours', 32, ink), 32);
    for (const frame of ALL_FRAMES) {
      for (let step = 0; step < stepsOf(frame); step++) {
        for (const [size, grid] of TRAY_SIZES) {
          batch.add(`${key(frame, theme, step)}.${size}`, markSvg(frame, grid, ink, step), size);
        }
      }
    }
  }
  const pngs = await batch.run();
  mkdirSync(dir, { recursive: true });
  const app = writeIco(
    dir,
    'otea',
    pngs,
    ICON_SIZES.map((size) => [`app.${size}`, size]),
  );
  const overlay = (kind: 'yours' | 'working') =>
    writeIco(dir, `overlay-${kind}`, pngs, [
      [`overlay.${kind}.16`, 16],
      [`overlay.${kind}.24`, 24],
      [`overlay.${kind}.32`, 32],
    ]);
  const tray = new Map<string, NativeImage>();
  for (const theme of ['light', 'dark'] as const) {
    for (const frame of ALL_FRAMES) {
      for (let step = 0; step < stepsOf(frame); step++) {
        const name = key(frame, theme, step);
        const sizes = TRAY_SIZES.map(([size]): [string, number] => [`${name}.${size}`, size]);
        tray.set(name, writeIco(dir, `tray-${frame}-${theme}-${step}`, pngs, sizes));
      }
    }
  }
  const png = (name: string) => pngs.get(name) as Buffer;
  return {
    app,
    tray: (frame, theme, step) => tray.get(key(frame, theme, step % stepsOf(frame))) as NativeImage,
    overlay: { yours: overlay('yours'), working: overlay('working') },
    menuYours: (theme) =>
      fromScales([
        [1, png(`menu.${theme}.16`)],
        [2, png(`menu.${theme}.32`)],
      ]),
  };
}

async function macIcons(): Promise<Icons> {
  const batch = new Batch();
  batch.add('app', macAppIconSvg(), 512);
  for (const theme of ['light', 'dark'] as const) {
    const ink = theme === 'dark' ? INK_ON_DARK : INK_ON_LIGHT;
    batch.add(`menu.${theme}.16`, markSvg('yours', 16, ink), 16);
    batch.add(`menu.${theme}.32`, markSvg('yours', 32, ink), 32);
  }
  for (const frame of ALL_FRAMES) {
    for (let step = 0; step < stepsOf(frame); step++) {
      batch.add(`${frame}.${step}.16`, markSvg(frame, 16, TEMPLATE, step), 16);
      batch.add(`${frame}.${step}.32`, markSvg(frame, 32, TEMPLATE, step), 32);
    }
  }
  const pngs = await batch.run();
  const png = (name: string) => pngs.get(name) as Buffer;
  const tray = new Map<string, NativeImage>();
  for (const frame of ALL_FRAMES) {
    for (let step = 0; step < stepsOf(frame); step++) {
      const image = fromScales([
        [1, png(`${frame}.${step}.16`)],
        [2, png(`${frame}.${step}.32`)],
      ]);
      image.setTemplateImage(true);
      tray.set(`${frame}.${step}`, image);
    }
  }
  const empty = nativeImage.createEmpty();
  return {
    app: nativeImage.createFromBuffer(png('app')),
    tray: (frame, _theme, step) => tray.get(`${frame}.${step % stepsOf(frame)}`) as NativeImage,
    overlay: { yours: empty, working: empty },
    menuYours: (theme) =>
      fromScales([
        [1, png(`menu.${theme}.16`)],
        [2, png(`menu.${theme}.32`)],
      ]),
  };
}

async function linuxIcons(): Promise<Icons> {
  const batch = new Batch();
  batch.add('app', appIconSvg(256), 256);
  for (const frame of ALL_FRAMES) {
    batch.add(`${frame}.24`, plateMarkSvg(frame), 24);
    batch.add(`${frame}.48`, plateMarkSvg(frame), 48);
  }
  batch.add('menu.16', markSvg('yours', 16, INK_ON_LIGHT), 16);
  batch.add('menu.32', markSvg('yours', 32, INK_ON_LIGHT), 32);
  const pngs = await batch.run();
  const png = (name: string) => pngs.get(name) as Buffer;
  const tray = new Map(
    ALL_FRAMES.map((frame) => [
      frame,
      fromScales([
        [1, png(`${frame}.24`)],
        [2, png(`${frame}.48`)],
      ]),
    ]),
  );
  const empty = nativeImage.createEmpty();
  const menu = fromScales([
    [1, png('menu.16')],
    [2, png('menu.32')],
  ]);
  return {
    app: nativeImage.createFromBuffer(png('app')),
    tray: (frame) => tray.get(frame) as NativeImage,
    overlay: { yours: empty, working: empty },
    menuYours: () => menu,
  };
}

export function loadIcons(cacheDir: string): Promise<Icons> {
  if (process.platform === 'win32') return windowsIcons(cacheDir);
  if (process.platform === 'darwin') return macIcons();
  return linuxIcons();
}
