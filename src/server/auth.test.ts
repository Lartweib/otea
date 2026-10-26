import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, request, SESSION_COOKIE, TOKEN } from './testing.ts';

describe('auth', () => {
  let project: Project;
  let server: OteaServer;

  const session = async (headers: Record<string, string> = {}) =>
    (
      await server.app.request('/api/session', { headers: { host: LOCAL_HOST, ...headers } })
    ).json();

  beforeEach(() => {
    project = memoryProject();
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  describe('GET /auth', () => {
    it('sets a strict http-only session cookie and redirects to the ui', async () => {
      const response = await request(server, `/auth?token=${TOKEN}`);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/');
      expect(response.headers.get('set-cookie')).toBe(
        `otea_session=${TOKEN}; Path=/; HttpOnly; SameSite=Strict`,
      );
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it.each(['/auth?token=wrong', '/auth', `/auth?token=${TOKEN}x`])(
      'rejects %s with 401 and sets no cookie',
      async (path) => {
        const response = await request(server, path);

        expect(response.status).toBe(401);
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(await response.text()).toContain('otea open');
      },
    );

    it('rejects every token when the server has none', async () => {
      const readOnly = createServer(project);

      expect((await request(readOnly, '/auth?token=')).status).toBe(401);
      readOnly.close();
    });

    it('keeps the host guard', async () => {
      expect((await request(server, `/auth?token=${TOKEN}`, 'evil.example:4400')).status).toBe(403);
    });
  });

  describe('GET /api/session', () => {
    it('cannot write without a cookie', async () => {
      expect(await session()).toEqual({ canWrite: false });
    });

    it('can write with the session cookie', async () => {
      expect(await session({ cookie: SESSION_COOKIE })).toEqual({ canWrite: true });
    });

    it('cannot write with a wrong cookie', async () => {
      expect(await session({ cookie: 'otea_session=wrong' })).toEqual({ canWrite: false });
    });
  });
});
