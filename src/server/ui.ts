import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

export const BUILT_UI_DIR = fileURLToPath(new URL('../../ui/dist', import.meta.url));

const NOT_BUILT =
  'The Otea UI is not built yet. Run "npm run build:ui" in the Otea checkout, then restart "otea serve".';

export function mountUi(app: Hono, uiDir: string): void {
  const index = join(uiDir, 'index.html');
  if (!existsSync(index)) {
    app.get('*', (c) => c.text(NOT_BUILT, 503));
    return;
  }
  app.use('*', serveStatic({ root: uiDir }));
  app.get('*', (c) => c.html(readFileSync(index, 'utf8')));
}
