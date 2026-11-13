import { mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { pairDevice } from '../app/devices.ts';
import { initProject, type Project } from '../app/project.ts';
import { tempGitRepo } from '../cli/testing.ts';
import { listCollections } from '../store/queries.ts';
import type { ProjectSettings } from './projects.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';

const DESK = '192.168.1.24';
const LAN_HOST = `${DESK}:4400`;
const PHONE = '192.168.1.50';

// The routes that change how the project is set up: its paths and its boards (Studio's every write).
type DeskRoute = {
  method?: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body: (repo: string) => unknown;
};
const DESK_ONLY: DeskRoute[] = [
  { path: '/api/project/paths', body: (repo) => ({ path: repo }) },
  { path: '/api/project/paths/relink', body: (repo) => ({ from: repo, to: repo }) },
  { path: '/api/project/paths/forget', body: (repo) => ({ path: repo }) },
  { path: '/api/boards', body: () => ({ name: 'Criaturas', lang: 'es' }) },
  { path: '/api/boards/set', body: () => ({ set: 'product', lang: 'es', boards: [] }) },
  {
    path: '/api/boards/agent-draft',
    body: () => ({ name: 'Criaturas', need: 'Un tablero', agent: null, lang: 'es' }),
  },
  { path: '/api/boards/publish-pair', body: () => ({ parent: 'b1', child: 'b2', moves: {} }) },
  { path: '/api/boards/restore-pair', body: () => ({ parent: 'b1', child: 'b2', versions: {} }) },
  {
    method: 'PUT',
    path: '/api/boards/b1/draft',
    body: () => ({ definition: {}, baseVersion: null }),
  },
  { method: 'DELETE', path: '/api/boards/b1/draft', body: () => ({}) },
  { path: '/api/boards/b1/draft/merge', body: () => ({ evidence: 1 }) },
  { path: '/api/boards/b1/publish', body: () => ({ moves: {} }) },
  { path: '/api/boards/b1/restore', body: () => ({ version: null }) },
];

describe('desk-only routes, with LAN access on', () => {
  const repos: Array<{ dir: string; remove: () => void }> = [];
  let home: string;
  let project: Project;
  let server: OteaServer;
  let phoneCookie: string;

  const repo = () => {
    const made = tempGitRepo();
    repos.push(made);
    return made.dir;
  };
  // This computer's signed-in browser, or a paired phone on the LAN.
  const post = (
    path: string,
    body: unknown,
    from: 'desk' | 'phone',
    method: DeskRoute['method'] = 'POST',
  ) => {
    const host = from === 'desk' ? LOCAL_HOST : LAN_HOST;
    const headers = {
      host,
      origin: `http://${host}`,
      cookie: from === 'desk' ? SESSION_COOKIE : phoneCookie,
      'content-type': 'application/json',
    };
    const remoteAddress = from === 'desk' ? '127.0.0.1' : PHONE;
    return Promise.resolve(
      server.app.request(
        path,
        { method, headers, body: JSON.stringify(body) },
        { incoming: { socket: { remoteAddress } } },
      ),
    );
  };
  const settings = async () => {
    const response = await server.app.request(
      '/api/project/settings',
      { headers: { host: LOCAL_HOST } },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    return (await response.json()) as ProjectSettings;
  };

  const boards = async () => {
    const response = await server.app.request(
      '/api/boards',
      { headers: { host: LOCAL_HOST } },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    return ((await response.json()) as { boards: Array<{ name: string }> }).boards;
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'otea-desk-home-'));
    const env = { OTEA_HOME: home };
    project = initProject(repo(), {}, env);
    phoneCookie = `otea_device_4400=${pairDevice(project.db, 'Pixel · Chrome').token}`;
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] }, env });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    for (const made of repos.splice(0)) made.remove();
    rmSync(home, { recursive: true, force: true });
  });

  it.each(DESK_ONLY)(
    'refuses $method $path to a paired device with 403',
    async ({ method, path, body }) => {
      const response = await post(path, body(repo()), 'phone', method);

      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: unknown }).error).toMatchObject({
        code: 'forbidden',
        details: { kind: 'desk_only' },
      });
    },
  );

  it('changes nothing for a paired device', async () => {
    const before = await settings();
    for (const { method, path, body } of DESK_ONLY) await post(path, body(repo()), 'phone', method);

    expect(await settings()).toEqual(before);
    expect((await boards()).map(({ name }) => name)).toEqual(['Pedidos']);
    expect(listCollections(project.db).map(({ name }) => name)).toEqual(['Pedidos']);
  });

  it('lets the desk add, relink and forget a path', async () => {
    const added = repo();

    expect((await post('/api/project/paths', { path: added }, 'desk')).status).toBe(201);
    expect((await settings()).paths.map((path) => path.path)).toContain(added);
    const moved = join(
      realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-desk-moved-'))),
      'repo',
    );
    renameSync(added, moved);
    repos.push({ dir: moved, remove: () => rmSync(moved, { recursive: true, force: true }) });
    const relinked = await post('/api/project/paths/relink', { from: added, to: moved }, 'desk');
    expect(relinked.status).toBe(200);
    expect((await post('/api/project/paths/forget', { path: moved }, 'desk')).status).toBe(200);
  });

  it('lets the desk create a board', async () => {
    expect((await post('/api/boards', { name: 'Criaturas', lang: 'es' }, 'desk')).status).toBe(201);
    expect((await boards()).map(({ name }) => name).sort()).toEqual(['Criaturas', 'Pedidos']);
  });

  it('still lets a paired device work on items', async () => {
    addCollection(project, { name: 'tasks' });
    const created = await post(
      '/api/items',
      { collection: 'tasks', fields: { title: 'From the phone', description: 'Now' } },
      'phone',
    );

    expect(created.status).toBe(201);
  });
});
