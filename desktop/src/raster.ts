// SVG to PNG, drawn by Chromium in a hidden window: the drawings stay code (marks.ts) and no image
// tooling or binary assets are needed. One batch at start-up renders every frame the shell uses.
import { BrowserWindow } from 'electron';

export type RasterJob = { svg: string; size: number };

const DRAW = `async (jobs) => Promise.all(jobs.map(async ({ svg, size }) => {
  const image = new Image(size, size);
  const sized = svg.replace(/width="[\\d.]+" height="[\\d.]+"/, 'width="' + size + '" height="' + size + '"');
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
}))`;

export async function rasterize(jobs: readonly RasterJob[]): Promise<Buffer[]> {
  const win = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  try {
    await win.loadURL('data:text/html,<!doctype html><meta charset="utf-8">');
    const encoded: string[] = await win.webContents.executeJavaScript(
      `(${DRAW})(${JSON.stringify(jobs)})`,
    );
    return encoded.map((base64) => Buffer.from(base64, 'base64'));
  } finally {
    win.destroy();
  }
}
