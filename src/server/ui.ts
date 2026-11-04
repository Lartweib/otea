import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import type { OteaEnv } from './session.ts';

export const BUILT_UI_DIR = fileURLToPath(new URL('../../ui/dist', import.meta.url));

const NOT_BUILT =
  'The Otea UI is not built yet. Run "npm run build:ui" in the Otea checkout, then restart "otea serve".';

export function mountUi(app: Hono<OteaEnv>, uiDir: string): void {
  const index = join(uiDir, 'index.html');
  if (!existsSync(index)) {
    app.get('*', (c) => c.text(NOT_BUILT, 503));
    return;
  }
  // The page is checked with the server on every load (a revoked device is sent back to the
  // pairing screen instead of opening a cached UI); the hashed assets cache as usual.
  app.use('*', async (c, next) => {
    await next();
    if (!c.req.path.startsWith('/assets/')) c.header('cache-control', 'no-cache');
  });
  app.use('*', serveStatic({ root: uiDir }));
  app.get('*', (c) => c.html(readFileSync(index, 'utf8')));
}
