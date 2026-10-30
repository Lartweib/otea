import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { attachEvidence, evidenceFile } from '../app/evidence.ts';
import type { ItemView } from '../app/items.ts';
import { createItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { memoryContext } from '../app/testing.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';

const bot: Actor = { kind: 'agent', name: 'claude' };

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

describe('evidence api', () => {
  let project: Project;
  let server: OteaServer;

  const get = (path: string, cookie = SESSION_COOKIE) =>
    Promise.resolve(server.app.request(path, { headers: { host: LOCAL_HOST, cookie } }));
  const attach = (name: string, content: string, role?: 'before' | 'after') => {
    const path = join(project.root, name);
    writeFileSync(path, content);
    return attachEvidence(project, {
      id: 'TASKS-1',
      path,
      actor: bot,
      channel: 'cli',
      ...(role ? { role } : {}),
    });
  };

  beforeEach(() => {
    project = { root: mkdtempSync(join(tmpdir(), 'otea-evidence-api-')), ...memoryContext() };
    addCollection(project, { name: 'tasks' });
    const fields = { description: 'Details' };
    createItem(project, { collection: 'tasks', title: 'Crash', fields, actor: bot });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(project.root, { recursive: true, force: true });
  });

  describe('GET /api/items/:id', () => {
    it('includes the evidence metadata of the item', async () => {
      attach('before.png', 'png', 'before');

      const item = (await (await get('/api/items/TASKS-1', '')).json()) as ItemView;

      expect(item.evidence).toEqual([
        expect.objectContaining({ id: 1, role: 'before', kind: 'image', filename: 'before.png' }),
      ]);
      expect(item.events.at(-1)).toMatchObject({ type: 'evidence_added' });
    });
  });

  describe('GET /api/evidence/:id/file', () => {
    it('streams an image inline with its stored type', async () => {
      attach('before.png', 'png-bytes');

      const response = await get('/api/evidence/1/file');

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('png-bytes');
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-type': 'image/png',
        'content-length': '9',
        'content-disposition': `inline; filename="before.png"; filename*=UTF-8''before.png`,
        'x-content-type-options': 'nosniff',
        'content-security-policy': 'sandbox',
      });
    });

    describe('byte ranges, which video players need to seek', () => {
      const ranged = (range: string) =>
        Promise.resolve(
          server.app.request('/api/evidence/1/file', {
            headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE, range },
          }),
        );

      beforeEach(() => {
        attach('clip.mp4', '0123456789');
      });

      it('announces that it serves ranges', async () => {
        expect((await get('/api/evidence/1/file')).headers.get('accept-ranges')).toBe('bytes');
      });

      it.each([
        ['bytes=2-5', '2345', 'bytes 2-5/10'],
        ['bytes=7-', '789', 'bytes 7-9/10'],
        ['bytes=-3', '789', 'bytes 7-9/10'],
        ['bytes=8-99', '89', 'bytes 8-9/10'],
      ])('answers %s with 206 and that part', async (range, body, contentRange) => {
        const response = await ranged(range);

        expect(response.status).toBe(206);
        expect(await response.text()).toBe(body);
        expect(Object.fromEntries(response.headers)).toMatchObject({
          'content-range': contentRange,
          'content-length': String(body.length),
          'content-type': 'video/mp4',
          'x-content-type-options': 'nosniff',
          'content-security-policy': 'sandbox',
        });
      });

      it('answers a range past the end with 416', async () => {
        const response = await ranged('bytes=10-');

        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe('bytes */10');
      });

      it('serves the whole file for a range it does not read', async () => {
        const response = await ranged('bytes=0-1,4-5');

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('0123456789');
      });
    });

    it('serves diffs and logs as plain text', async () => {
      attach('fix.diff', '<script>alert(1)</script>');

      const response = await get('/api/evidence/1/file');

      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    });

    it.each([
      ['icon.svg', 'image/svg+xml'],
      ['page.html', 'application/octet-stream'],
    ])('serves %s as a download, never rendered in the app origin', async (name, type) => {
      attach(name, '<svg onload="alert(1)"/>');

      const response = await get('/api/evidence/1/file');

      expect(response.headers.get('content-type')).toBe(type);
      expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('keeps a filename outside ASCII usable in the download header', async () => {
      attach("ñandú 'v1'.png", 'png');

      expect((await get('/api/evidence/1/file')).headers.get('content-disposition')).toBe(
        `inline; filename="_and_ 'v1'.png"; filename*=UTF-8''%C3%B1and%C3%BA%20%27v1%27.png`,
      );
    });

    it.each([
      ['no cookie', ''],
      ['a wrong cookie', 'otea_session_4400=wrong'],
    ])('requires the session: 401 with %s', async (_, cookie) => {
      attach('before.png', 'png');

      const response = await get('/api/evidence/1/file', cookie);

      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe('unauthorized');
    });

    it.each(['/api/evidence/9/file', '/api/evidence/abc/file', '/api/evidence/1.5/file'])(
      'answers 404 for %s',
      async (path) => {
        attach('before.png', 'png');

        const response = await get(path);

        expect(response.status).toBe(404);
        expect(await errorCode(response)).toBe('not_found');
      },
    );

    it('answers 404 when the stored file is gone', async () => {
      const { sha256 } = attach('before.png', 'png');
      rmSync(evidenceFile(project.root, sha256));

      expect((await get('/api/evidence/1/file')).status).toBe(404);
    });

    it('keeps the host guard', async () => {
      attach('before.png', 'png');

      const response = await server.app.request('/api/evidence/1/file', {
        headers: { host: 'evil.example:4400', cookie: SESSION_COOKIE },
      });

      expect(response.status).toBe(403);
    });
  });
});
