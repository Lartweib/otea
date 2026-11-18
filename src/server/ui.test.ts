import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject, request } from './testing.ts';

describe('ui', () => {
  let dir: string;
  let project: Project;
  let server: OteaServer;

  const get = (path: string) => request(server, path);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'otea-ui-'));
    writeFileSync(join(dir, 'secret.txt'), 'outside the ui');
    project = memoryProject();
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('when built', () => {
    beforeEach(() => {
      const uiDir = join(dir, 'dist');
      mkdirSync(join(uiDir, 'assets'), { recursive: true });
      writeFileSync(join(uiDir, 'index.html'), '<!doctype html><title>Otea</title>');
      writeFileSync(join(uiDir, 'assets', 'app.js'), 'console.log(1)');
      server = createServer(project, { uiDir });
    });

    it('opens a project from /, and serves its page at /p/<id>/', async () => {
      const home = await get('/');
      expect(home.status).toBe(302);
      expect(home.headers.get('location')).toBe('/p/memory-aaaaaa/');

      const response = await get('/p/memory-aaaaaa/');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>Otea</title>');
      expect((await get('/p/memory-aaaaaa')).headers.get('location')).toBe('/p/memory-aaaaaa/');
    });

    it('sends a project it does not serve back to /', async () => {
      const response = await get('/p/gone-zzzzzz/');
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/');
    });

    it('has the page checked on every load, but not the assets', async () => {
      expect((await get('/p/memory-aaaaaa/')).headers.get('cache-control')).toBe('no-cache');
      expect((await get('/pair')).headers.get('cache-control')).toBe('no-cache');
      expect((await get('/assets/app.js')).headers.get('cache-control')).toBeNull();
    });

    it('serves assets with their content type', async () => {
      const response = await get('/assets/app.js');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('javascript');
      expect(await response.text()).toBe('console.log(1)');
    });

    it('answers no page outside a project and the pairing screen', async () => {
      expect((await get('/some/page')).status).toBe(404);
    });

    it('falls back to index.html for unknown paths of a project', async () => {
      const response = await get('/p/memory-aaaaaa/some/page');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('<title>Otea</title>');
    });

    it('never serves files outside the ui folder', async () => {
      for (const path of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt']) {
        expect(await (await get(path)).text()).not.toContain('outside the ui');
      }
    });

    it('keeps unknown api routes as JSON 404', async () => {
      const response = await get('/p/memory-aaaaaa/api/nope');

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
    });
  });

  describe('when not built', () => {
    beforeEach(() => {
      server = createServer(project, { uiDir: join(dir, 'missing') });
    });

    it('tells how to build it on a project page', async () => {
      const response = await get('/p/memory-aaaaaa/');

      expect(response.status).toBe(503);
      expect(await response.text()).toContain('npm run build:ui');
    });
  });
});
