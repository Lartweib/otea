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

  it.each(['/api/items', '/api/items/TASKS-1', '/api/stream', '/', '/TASKS-1'])(
    'rejects a rebinding-style host on %s with 403',
    async (path) => {
      const response = await request(server, path, 'evil.example:4400');

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'forbidden_host' } });
    },
  );

  it.each(['127.0.0.1:4400', 'localhost:4400'])('accepts %s', async (host) => {
    expect((await request(server, '/api/items', host)).status).toBe(200);
  });

  it('rejects a request without a host header', async () => {
    expect((await server.app.request('/api/items')).status).toBe(403);
  });

  it('accepts only the port it listens on', async () => {
    server.listeningOn(5000);

    expect((await request(server, '/api/items', '127.0.0.1:5000')).status).toBe(200);
    expect((await request(server, '/api/items', '127.0.0.1:4400')).status).toBe(403);
  });
});
