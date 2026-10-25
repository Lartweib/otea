import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject } from './testing.ts';

describe('ui', () => {
  let dir: string;
  let project: Project;
  let server: OteaServer;

  const get = (path: string) => server.app.request(path);

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

    it('serves index.html at /', async () => {
      const response = await get('/');

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>Otea</title>');
    });

    it('serves assets with their content type', async () => {
      const response = await get('/assets/app.js');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('javascript');
      expect(await response.text()).toBe('console.log(1)');
    });

    it('falls back to index.html for unknown paths', async () => {
      const response = await get('/some/page');

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
      const response = await get('/api/nope');

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
    });
  });

  describe('when not built', () => {
    beforeEach(() => {
      server = createServer(project, { uiDir: join(dir, 'missing') });
    });

    it('tells how to build it at /', async () => {
      const response = await get('/');

      expect(response.status).toBe(503);
      expect(await response.text()).toContain('npm run build:ui');
    });
  });
});
