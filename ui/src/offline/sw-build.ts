import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// Builds the service worker (sw.ts) into /sw.js beside the app, on its own, as one classic script:
// the files the app is made of, listed at build time, are what it keeps for opening without the
// PC; their names (hashed by content) make the version, so any change makes a new version.

// What the app opens with: the page, its built files, its icons and its manifest. Not the source
// maps, not the old .woff fonts (every browser that runs a service worker takes .woff2), and not
// the service worker itself.
export function precacheList(bundled: readonly string[], publicFiles: readonly string[]): string[] {
  const files = [...bundled, ...publicFiles]
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => !/\.(map|woff)$/.test(name) && name !== 'sw.js' && name !== 'index.html')
    .map((name) => `/${name}`);
  return ['/', ...[...new Set(files)].sort()];
}

export function versionOf(list: readonly string[]): string {
  return createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 12);
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

const ENTRY = fileURLToPath(new URL('./sw.ts', import.meta.url));

export function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'otea-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    async generateBundle(_options, bundle) {
      const list = precacheList(Object.keys(bundle), publicDir ? filesUnder(publicDir) : []);
      const { rolldown } = await import('rolldown');
      const build = await rolldown({
        input: ENTRY,
        transform: {
          define: {
            __OTEA_VERSION__: JSON.stringify(versionOf(list)),
            __OTEA_PRECACHE__: JSON.stringify(list),
          },
        },
      });
      const { output } = await build.generate({ format: 'iife', minify: true });
      await build.close();
      const [chunk] = output;
      if (!chunk || chunk.type !== 'chunk') throw new Error('The service worker did not build');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: chunk.code });
    },
  };
}
