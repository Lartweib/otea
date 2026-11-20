import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject, request } from './testing.ts';

describe('host guard', () => {
  let project: Project;
  let server: OteaServer;

  beforeEach(() => {
    project = memoryProject();
    server = createServer(project);
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it.each([
    '/p/memory-aaaaaa/api/items',
    '/p/memory-aaaaaa/api/items/TASKS-1',
    '/p/memory-aaaaaa/api/stream',
    '/',
    '/TASKS-1',
  ])('rejects a rebinding-style host on %s with 403', async (path) => {
    const response = await request(server, path, 'evil.example:4400');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'forbidden_host' } });
  });

  // A phone that opens an address Otea does not answer at (the Android emulator's 10.0.2.2, say)
  // gets a page that says what to open instead, never the raw JSON refusal (DR2-11).
  describe('a page opened at an address Otea does not answer at', () => {
    const open = (path: string, headers: Record<string, string>) =>
      Promise.resolve(
        server.app.request(path, {
          headers: { host: '10.0.2.2:4400', accept: 'text/html,application/xhtml+xml', ...headers },
        }),
      );

    it('says, in a page, to open the address the desk shows', async () => {
      const response = await open('/', {});

      expect(response.status).toBe(403);
      expect(response.headers.get('content-type')).toMatch(/^text\/html/);
      const html = await response.text();
      expect(html).toContain('Settings › Phone');
      expect(html).not.toContain('forbidden_host');
      expect(html).not.toContain('10.0.2.2');
    });

    it('speaks Spanish to a browser that asks for it', async () => {
      const html = await (await open('/TASKS-1', { 'accept-language': 'es-AR,es;q=0.9' })).text();

      expect(html).toContain('<html lang="es">');
      expect(html).toContain('Configuración › Teléfono');
    });

    it('keeps the JSON refusal for the API', async () => {
      const response = await open('/p/memory-aaaaaa/api/items', {});

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'forbidden_host' } });
    });
  });

  it('rejects a request without a host header', async () => {
    expect((await server.app.request('/p/memory-aaaaaa/api/items')).status).toBe(403);
  });

  it('accepts only the port it listens on', async () => {
    server.listeningOn(5000);

    expect((await request(server, '/p/memory-aaaaaa/api/items', '127.0.0.1:5000')).status).toBe(
      200,
    );
    expect((await request(server, '/p/memory-aaaaaa/api/items', '127.0.0.1:4400')).status).toBe(
      403,
    );
  });
});
