import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, Hono } from 'hono';
import type { OteaEnv } from './session.ts';

export const BUILT_UI_DIR = fileURLToPath(new URL('../../ui/dist', import.meta.url));

const NOT_BUILT =
  'The Otea UI is not built yet. Run "npm run build:ui" in the Otea checkout, then restart "otea serve".';

// The home-screen manifest in the device's language: ui/public/manifest.webmanifest says it in its
// `lang` and keeps the other languages in `description_localized`; a home screen reads one
// description, so the server serves the one the device asks for first (Accept-Language).
type Manifest = {
  lang?: string;
  description?: string;
  description_localized?: Record<string, string>;
  [key: string]: unknown;
};

// A project's shortcut (P7-13): one server serves every project, so each project's page offers its
// own, named after it and opening it (its own id, so a phone keeps one per project). The scope
// stays the whole server, so switching projects inside the app never leaves it.
type Shortcut = { id: string; name: string };

function localizedManifest(c: Context, path: string, shortcut?: Shortcut): Response {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  const localized = manifest.description_localized ?? {};
  const asked = (c.req.header('accept-language') ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim().split('-')[0]?.toLowerCase() ?? '');
  const lang = asked.find((tag) => tag === manifest.lang || tag in localized);
  const described =
    lang && lang !== manifest.lang && localized[lang]
      ? { ...manifest, lang, description: localized[lang] }
      : manifest;
  const served = shortcut
    ? {
        ...described,
        name: `${shortcut.name} · Otea`,
        short_name: shortcut.name,
        id: `/p/${shortcut.id}/`,
        start_url: `/p/${shortcut.id}/`,
      }
    : described;
  c.header('vary', 'Accept-Language');
  return c.body(JSON.stringify(served), 200, { 'content-type': 'application/manifest+json' });
}

// `nameOf`: a served project's name by its id, for its shortcut.
export function mountUi(
  app: Hono<OteaEnv>,
  uiDir: string,
  nameOf: (id: string) => string | undefined = () => undefined,
): void {
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
  app.get('/manifest.webmanifest', (c) =>
    localizedManifest(c, join(uiDir, 'manifest.webmanifest')),
  );
  app.get('/p/:id/manifest.webmanifest', (c) => {
    const id = c.req.param('id');
    const name = nameOf(id);
    if (name === undefined) return c.text('Not found', 404);
    return localizedManifest(c, join(uiDir, 'manifest.webmanifest'), { id, name });
  });
  app.use('*', serveStatic({ root: uiDir }));
  // The page: a project's (/p/<id>/…, its places in the hash) and the pairing screen. The installed
  // app keeps it as /index.html, so it opens any project's page without the PC.
  const page = (c: Context) => c.html(readFileSync(index, 'utf8'));
  app.get('/p/*', page);
  app.get('/pair', page);
  app.get('*', (c) => c.text('Not found', 404));
}
