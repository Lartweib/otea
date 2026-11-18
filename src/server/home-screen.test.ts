import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const DESK = '192.168.1.24';
const PHONE = '192.168.1.50';

// What a phone on the LAN needs before it pairs: the pairing screen, and what adding Otea to its
// home screen reads (the manifest and its icons), under the IP or this computer's .local name.
describe('home screen on the LAN', () => {
  let dir: string;
  let project: Project;
  let server: OteaServer;

  const get = (path: string, host = `${DESK}:4400`) =>
    Promise.resolve(
      server.app.request(
        path,
        { headers: { host } },
        { incoming: { socket: { remoteAddress: PHONE } } },
      ),
    );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'otea-home-'));
    mkdirSync(join(dir, 'icons'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><link rel="manifest" href="/manifest.webmanifest">',
    );
    writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"Otea","display":"standalone"}');
    writeFileSync(join(dir, 'icons', 'otea-192.png'), 'png');
    writeFileSync(join(dir, 'icons', 'apple-touch-icon.png'), 'png');
    writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    project = memoryProject();
    server = createServer(project, {
      uiDir: dir,
      lan: { addresses: [DESK], names: ['desk.local'] },
    });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the manifest to an unpaired device, as a web app manifest', async () => {
    const response = await get('/manifest.webmanifest');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/manifest+json');
    expect(await response.json()).toMatchObject({ name: 'Otea', display: 'standalone' });
  });

  it('describes Otea in the language the device asks for, English otherwise', async () => {
    writeFileSync(
      join(dir, 'manifest.webmanifest'),
      JSON.stringify({
        name: 'Otea',
        lang: 'en',
        description: 'In English.',
        description_localized: { es: 'En español.' },
      }),
    );
    const ask = async (language: string | undefined) => {
      const response = await Promise.resolve(
        server.app.request(
          '/manifest.webmanifest',
          {
            headers: { host: `${DESK}:4400`, ...(language ? { 'accept-language': language } : {}) },
          },
          { incoming: { socket: { remoteAddress: PHONE } } },
        ),
      );
      expect(response.headers.get('content-type')).toContain('application/manifest+json');
      expect(response.headers.get('vary')).toContain('Accept-Language');
      return response.json();
    };

    expect(await ask('es-AR,es;q=0.9,en;q=0.8')).toMatchObject({
      lang: 'es',
      description: 'En español.',
    });
    expect(await ask('fr-FR,en;q=0.8')).toMatchObject({ lang: 'en', description: 'In English.' });
    expect(await ask(undefined)).toMatchObject({ lang: 'en', description: 'In English.' });
  });

  it.each(['/icons/otea-192.png', '/icons/apple-touch-icon.png'])(
    'serves %s to an unpaired device',
    async (path) => {
      expect((await get(path)).status).toBe(200);
    },
  );

  // The installed app's service worker (HTTPS only): checked with the server on every open, so a
  // new version installs itself, and served like the other static files.
  it('serves the service worker as a script the browser checks on every open', async () => {
    const response = await get('/sw.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('still keeps everything else from an unpaired device', async () => {
    expect((await get('/p/memory-aaaaaa/api/items')).status).toBe(401);
    expect((await get('/icons/../index.html')).status).not.toBe(200);
  });

  // A home-screen app opens its start URL with no device token (iOS keeps its storage apart from
  // Safari's): the server sends it to the pairing screen, which then serves the page.
  it('sends a launch without a device token to the pairing screen', async () => {
    const launch = await get('/');

    expect(launch.status).toBe(302);
    expect(launch.headers.get('location')).toBe('/pair');
    const pair = await get('/pair');
    expect(pair.status).toBe(200);
    expect(await pair.text()).toContain('rel="manifest"');
  });

  it.each(['desk.local:4400', 'DESK.local:4400'])(
    'answers on its .local name, %s',
    async (host) => {
      expect((await get('/pair', host)).status).toBe(200);
    },
  );

  it.each(['other.local:4400', 'desk.local.evil.example:4400', 'desk.local:9999'])(
    'refuses any other name, %s',
    async (host) => {
      expect((await get('/pair', host)).status).toBe(403);
    },
  );
});

// One server serves every project: each one's page offers its own home-screen shortcut, named after
// it and opening it, so three projects never make three icons all called Otea (P7-13).
describe('a home-screen shortcut per project', () => {
  let dir: string;
  let project: Project;
  let server: OteaServer;

  const get = (path: string, language = 'en') =>
    Promise.resolve(
      server.app.request(path, {
        headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE, 'accept-language': language },
      }),
    );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'otea-home-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(
      join(dir, 'manifest.webmanifest'),
      JSON.stringify({
        name: 'Otea',
        short_name: 'Otea',
        lang: 'en',
        description: 'In English.',
        description_localized: { es: 'En español.' },
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
      }),
    );
    project = memoryProject();
    server = createServer(project, { uiDir: dir, token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('names the shortcut after the project and opens that project', async () => {
    const { id, name } = project.identity;
    const response = await get(`/p/${id}/manifest.webmanifest`, 'es-ES,es;q=0.9');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/manifest+json');
    expect(await response.json()).toMatchObject({
      name: `${name} · Otea`,
      short_name: name,
      id: `/p/${id}/`,
      start_url: `/p/${id}/`,
      scope: '/',
      display: 'standalone',
      description: 'En español.',
    });
  });

  it('keeps the plain Otea manifest for the pairing screen', async () => {
    expect(await (await get('/manifest.webmanifest')).json()).toMatchObject({
      name: 'Otea',
      start_url: '/',
    });
  });
});
