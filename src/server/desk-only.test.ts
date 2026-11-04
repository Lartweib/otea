import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { pairDevice } from '../app/devices.ts';
import { initProject, type Project } from '../app/project.ts';
import { duplicatePreset } from '../app/studio.ts';
import { tempGitRepo } from '../cli/testing.ts';
import { listCollections } from '../store/queries.ts';
import type { ProjectSettings } from './projects.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';

const DESK = '192.168.1.24';
const LAN_HOST = `${DESK}:4400`;
const PHONE = '192.168.1.50';

// The routes that change how the project is set up: its paths, presets and blueprint.
const DESK_ONLY: Array<{ path: string; body: (repo: string) => unknown }> = [
  { path: '/api/project/paths', body: (repo) => ({ path: repo }) },
  { path: '/api/project/paths/relink', body: (repo) => ({ from: repo, to: repo }) },
  { path: '/api/project/paths/forget', body: (repo) => ({ path: repo }) },
  { path: '/api/studio/presets/mine', body: () => ({ yaml: 'preset: mine\n' }) },
  { path: '/api/studio/presets/tasks/duplicate', body: () => ({ as: 'my-tasks' }) },
  {
    path: '/api/studio/blueprint',
    body: () => ({ boards: [{ name: 'art', preset: 'tasks' }], connections: [], playbook: null }),
  },
  { path: '/api/studio/blueprint/apply', body: () => ({ name: 'product' }) },
  { path: '/api/studio/blueprint/update', body: () => ({}) },
  { path: '/api/studio/blueprint/boards/work/copy-preset', body: () => ({ as: 'game-tasks' }) },
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
  const post = (path: string, body: unknown, from: 'desk' | 'phone') => {
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
        { method: 'POST', headers, body: JSON.stringify(body) },
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

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'otea-desk-home-'));
    const env = { OTEA_HOME: home };
    project = initProject(repo(), {}, env);
    duplicatePreset(project, 'tasks', 'mine');
    phoneCookie = `otea_device_4400=${pairDevice(project.db, 'Pixel · Chrome').token}`;
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] }, env });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    for (const made of repos.splice(0)) made.remove();
    rmSync(home, { recursive: true, force: true });
  });

  it.each(DESK_ONLY)('refuses $path to a paired device with 403', async ({ path, body }) => {
    const response = await post(path, body(repo()), 'phone');

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('changes nothing for a paired device', async () => {
    const before = await settings();
    const mine = join(project.dataDir, 'presets', 'mine', 'preset.yaml');
    const preset = readFileSync(mine, 'utf8');
    for (const { path, body } of DESK_ONLY) await post(path, body(repo()), 'phone');

    expect(await settings()).toEqual(before);
    expect(readFileSync(mine, 'utf8')).toBe(preset);
    expect(existsSync(join(project.dataDir, 'presets', 'my-tasks'))).toBe(false);
    expect(listCollections(project.db)).toEqual([]);
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

  it('lets the desk duplicate and save a preset, and apply, edit and update a blueprint', async () => {
    const copy = await post('/api/studio/presets/tasks/duplicate', { as: 'my-tasks' }, 'desk');
    expect(copy.status).toBe(201);
    const source = await server.app.request(
      '/api/studio/presets/my-tasks',
      { headers: { host: LOCAL_HOST } },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    const { yaml } = (await source.json()) as { yaml: string };
    expect((await post('/api/studio/presets/my-tasks', { yaml }, 'desk')).status).toBe(200);

    expect((await post('/api/studio/blueprint/apply', { name: 'product' }, 'desk')).status).toBe(
      201,
    );
    const edit = {
      boards: [
        { name: 'work', preset: 'tasks' },
        { name: 'bugs', preset: 'bug-triage' },
      ],
      connections: [],
      playbook: null,
    };
    expect((await post('/api/studio/blueprint', edit, 'desk')).status).toBe(200);
    expect((await post('/api/studio/blueprint/update', {}, 'desk')).status).toBe(200);
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
