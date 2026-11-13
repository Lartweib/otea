// Bundles the shell into dist/: the main process (main.mjs, which also takes in what it shares with
// the web UI from ../ui/src), the window's preload (preload.cjs: a sandboxed preload is one CommonJS
// file) and the project picker (picker.html, picker.js and its fonts). `npm start` and the packaging
// both run it first. Run: node build.mjs
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
const src = (name) => join(here, 'src', name);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

const common = { bundle: true, logLevel: 'warning', legalComments: 'none' };
await build({
  ...common,
  entryPoints: [src('main.ts')],
  outfile: join(out, 'main.mjs'),
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // electron-updater ships in the app's node_modules (a dependency), Electron is the runtime.
  external: ['electron', 'electron-updater'],
});
await build({
  ...common,
  entryPoints: [src('preload.ts')],
  outfile: join(out, 'preload.cjs'),
  platform: 'browser',
  format: 'cjs',
  target: 'chrome140',
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: [src('picker.ts')],
  outfile: join(out, 'picker.js'),
  platform: 'browser',
  format: 'iife',
  target: 'chrome140',
});
copyFileSync(src('picker.html'), join(out, 'picker.html'));

// The web UI's faces, from the root's Fontsource packages (the root `npm ci` installs them).
const modules = join(here, '..', 'node_modules');
for (const [pkg, file] of [
  ['@fontsource-variable/newsreader', 'newsreader-latin-opsz-normal.woff2'],
  ['@fontsource-variable/newsreader', 'newsreader-latin-opsz-italic.woff2'],
  ['@fontsource-variable/schibsted-grotesk', 'schibsted-grotesk-latin-wght-normal.woff2'],
  ['@fontsource/dm-mono', 'dm-mono-latin-400-normal.woff2'],
]) {
  copyFileSync(join(modules, pkg, 'files', file), join(out, 'fonts', file));
}
