// Renders every icon file Otea ships from the one drawing in src/marks.ts (see src/icon-files.ts):
// the favicons and home-screen icons in ui/public, and build/icon.ico and build/icon.png for the
// packaged app. Bundles src/render-icons.ts and runs it on the app's Electron, so the files are
// drawn by the same Chromium as the tray. Run after changing a drawing: npm run icons
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(desktop, '..');
const work = mkdtempSync(join(tmpdir(), 'otea-icons-'));
const main = join(work, 'render-icons.mjs');

await build({
  entryPoints: [join(desktop, 'src', 'render-icons.ts')],
  outfile: main,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
});
const electron = createRequire(import.meta.url)('electron');
try {
  execFileSync(electron, [main, repo], { stdio: 'inherit' });
} finally {
  rmSync(work, { recursive: true, force: true });
}
