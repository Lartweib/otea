// Lays out in stage/otea the Otea CLI the packaged app carries (electron-builder copies it to the
// app's resources/otea): the checkout's package.json and lock, src without its tests, the built web
// UI, the presets and the schemas, and the production dependencies (all plain JavaScript). The app
// runs src/cli/main.ts on its own Electron as Node, which strips the types as Node does, so the
// files keep the paths they have in a checkout (src/server/ui.ts finds ../../ui/dist, and so on).
// Needs the root's `npm run build:ui` first. Run: node scripts/stage-cli.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(desktop, '..');
const stage = join(desktop, 'stage', 'otea');

if (!existsSync(join(repo, 'ui', 'dist', 'index.html'))) {
  throw new Error('No built UI in ui/dist: run npm run build:ui at the root first');
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'LICENSE']) {
  cpSync(join(repo, file), join(stage, file));
}
const notTest = (path) => !/\.test\.ts$|[\\/]test-setup\.ts$/.test(path);
cpSync(join(repo, 'src'), join(stage, 'src'), { recursive: true, filter: notTest });
cpSync(join(repo, 'ui', 'dist'), join(stage, 'ui', 'dist'), { recursive: true });
cpSync(join(repo, 'presets'), join(stage, 'presets'), { recursive: true });
cpSync(join(repo, 'schemas'), join(stage, 'schemas'), { recursive: true });

execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: stage,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
