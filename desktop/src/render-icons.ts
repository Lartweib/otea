// Electron's main for scripts/render-icons.mjs: rasterizes every file of icon-files.ts with the same
// Chromium the app draws its tray with, writes them under the repository given as the argument, and
// records what each was drawn from in build/icons.json. Then quits.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { encodeIco } from './ico.ts';
import { ICON_FILES, ICONS_RECORD, iconsRecord } from './icon-files.ts';
import { type RasterJob, rasterize } from './raster.ts';

const repo = process.argv.at(-1) as string;

async function render(): Promise<void> {
  const jobs: RasterJob[] = [];
  for (const file of ICON_FILES) {
    if (file.kind === 'png') jobs.push({ svg: file.svg, size: file.size });
    if (file.kind === 'ico') jobs.push(...file.images);
  }
  const pngs = await rasterize(jobs);
  let next = 0;
  const write = (path: string, data: string | Buffer) => {
    const to = join(repo, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
    console.log(`wrote ${path}`);
  };
  for (const file of ICON_FILES) {
    if (file.kind === 'svg') write(file.path, file.svg);
    else if (file.kind === 'png') write(file.path, pngs[next++] as Buffer);
    else {
      const images = file.images.map(({ size }) => ({ size, png: pngs[next++] as Buffer }));
      write(file.path, encodeIco(images));
    }
  }
  write(ICONS_RECORD, `${JSON.stringify(iconsRecord(), null, 2)}\n`);
}

// A profile in the script's temporary folder, never the app's or Electron's shared one.
app.setPath('userData', join(dirname(process.argv[1] as string), 'profile'));
app.disableHardwareAcceleration();
void app.whenReady().then(async () => {
  try {
    await render();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
