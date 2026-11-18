import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { pairDevice } from '../app/devices.ts';
import { createItem } from '../app/items.ts';
import { localProjects, memoryMachine, rememberLocalProject } from '../app/machine.ts';
import { initProject, type Project } from '../app/project.ts';
import { tempGitRepo } from '../cli/testing.ts';
import { machineProjects, openProjects } from './hub.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const DESK = '192.168.1.24';
const LAN_HOST = `${DESK}:4400`;
const PHONE = '192.168.1.50';

const human = { kind: 'human', name: 'ana' } as const;

// A project in memory under an identity of its own: two of them are two projects on one server.
function named(id: string, name: string, title: string): Project {
  const project = { ...memoryProject(), identity: { id, name } };
  addCollection(project, { name: 'tasks' });
  createItem(project, { collection: 'tasks', title, fields: { description: '-' }, actor: human });
  return project;
}

describe('one server for every project', () => {
  let alpha: Project;
  let beta: Project;
  let server: OteaServer;

  const call = (path: string, init: RequestInit = {}, from: 'desk' | 'phone' = 'desk') =>
    Promise.resolve(
      server.app.request(
        path,
        {
          ...init,
          headers: { host: from === 'desk' ? LOCAL_HOST : LAN_HOST, ...(init.headers ?? {}) },
        },
        { incoming: { socket: { remoteAddress: from === 'desk' ? '127.0.0.1' : PHONE } } },
      ),
    );
  const titles = async (id: string, headers: Record<string, string> = {}, from?: 'phone') =>
    (
      (await (await call(`/p/${id}/api/items`, { headers }, from)).json()) as Array<{
        title: string;
      }>
    ).map((item) => item.title);
  const create = (id: string, cookie: string, from: 'desk' | 'phone' = 'desk') => {
    const host = from === 'desk' ? LOCAL_HOST : LAN_HOST;
    return call(
      `/p/${id}/api/items`,
      {
        method: 'POST',
        headers: { cookie, origin: `http://${host}`, 'content-type': 'application/json' },
        body: JSON.stringify({ collection: 'tasks', fields: { title: `In ${id}` } }),
      },
      from,
    );
  };

  beforeEach(() => {
    alpha = named('alpha-aaaaaa', 'alpha', 'Alpha work');
    beta = named('beta-bbbbbb', 'beta', 'Beta work');
    server = createServer(openProjects(alpha, beta), { token: TOKEN, lan: { addresses: [DESK] } });
  });

  afterEach(() => {
    server.close();
    alpha.db.close();
    beta.db.close();
  });

  it('serves each project under its own path, and says whose each answer is', async () => {
    expect(await titles('alpha-aaaaaa')).toEqual(['Alpha work']);
    expect(await titles('beta-bbbbbb')).toEqual(['Beta work']);
    const answer = await call('/p/beta-bbbbbb/api/project');
    expect(answer.headers.get('x-otea-project')).toBe('beta-bbbbbb');
  });

  it('answers a project it does not serve with a clear 404', async () => {
    const response = await call('/p/gone-zzzzzz/api/items');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'no_project' } });
    expect((await call('/api/items')).status).toBe(404);
  });

  it('lists every project it serves, marking the one asking', async () => {
    const response = await call('/p/beta-bbbbbb/api/projects');
    const projects = (await response.json()) as Array<{ id: string; current: boolean }>;
    expect(projects.map(({ id, current }) => [id, current])).toEqual([
      ['alpha-aaaaaa', false],
      ['beta-bbbbbb', true],
    ]);
  });

  it('signs a browser in once for every project, and lands it on the project asked', async () => {
    const signIn = await call(`/auth?token=${TOKEN}&next=${encodeURIComponent('/p/beta-bbbbbb/')}`);
    expect(signIn.status).toBe(302);
    expect(signIn.headers.get('location')).toBe('/p/beta-bbbbbb/');
    expect((await create('alpha-aaaaaa', SESSION_COOKIE)).status).toBe(201);
    expect((await create('beta-bbbbbb', SESSION_COOKIE)).status).toBe(201);
  });

  it('never sends a sign-in on to another site', async () => {
    for (const next of ['https://evil.example/', '//evil.example/', '/p/x/../../evil'])
      expect(
        (await call(`/auth?token=${TOKEN}&next=${encodeURIComponent(next)}`)).headers.get(
          'location',
        ),
      ).toBe('/');
  });

  it('opens the project a browser had open last from /', async () => {
    const page = await call('/p/beta-bbbbbb/');
    const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(cookie).toBe('otea_project_4400=beta-bbbbbb');
    const home = await call('/', { headers: { cookie } });
    expect(home.headers.get('location')).toBe('/p/beta-bbbbbb/');
    expect((await call('/')).headers.get('location')).toBe('/p/alpha-aaaaaa/');
  });

  it('lets one paired phone read and write in every project', async () => {
    const { token } = pairDevice(server.machine, 'Pixel · Chrome');
    const cookie = `otea_device_4400=${token}`;
    expect(await titles('alpha-aaaaaa', { cookie }, 'phone')).toEqual(['Alpha work']);
    expect(await titles('beta-bbbbbb', { cookie }, 'phone')).toEqual(['Beta work']);
    expect((await create('beta-bbbbbb', cookie, 'phone')).status).toBe(201);
    // Unpaired, a phone reaches neither.
    expect((await call('/p/alpha-aaaaaa/api/items', {}, 'phone')).status).toBe(401);
  });
});

describe('the projects of an Otea home', () => {
  const made: Array<{ remove: () => void }> = [];
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'otea-hub-home-'));
  });

  afterEach(() => {
    for (const each of made.splice(0)) each.remove();
    rmSync(home, { recursive: true, force: true });
  });

  const repo = () => {
    const one = tempGitRepo();
    made.push(one);
    return one.dir;
  };

  it('serves the registered projects and the local ones otea serve was run in', () => {
    const env = { OTEA_HOME: home };
    const common = initProject(repo(), {}, env);
    const local = initProject(repo(), { local: true }, env);
    const machine = memoryMachine();
    rememberLocalProject(machine, { id: local.identity.id, root: local.root });
    const source = machineProjects(env, machine);
    try {
      const ids = source.list().map((each) => each.id);
      expect(ids.sort()).toEqual([common.identity.id, local.identity.id].sort());
      expect(source.get(local.identity.id)?.root).toBe(local.root);
    } finally {
      source.close();
      common.db.close();
      local.db.close();
    }

    // A local project moved away (migrated, or its folder gone) is no longer served.
    renameSync(join(local.root, '.otea'), join(local.root, '.otea.moved'));
    const again = machineProjects(env, machine);
    expect(again.list().map((each) => each.id)).toEqual([common.identity.id]);
    expect(localProjects(machine)).toEqual([]);
    again.close();
    machine.close();
  });
});
