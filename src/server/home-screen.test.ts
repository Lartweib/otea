import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject } from './testing.ts';

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
    expect((await get('/api/items')).status).toBe(401);
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
