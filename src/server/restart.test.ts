import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, getItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import type { Project } from '../app/project.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Retomar and Reasignar from the UI (POST /api/items/:id/restart and /reassign), and Deshacer for
// either (POST /api/items/:id/undo with {"release": true}).

const kiln: Actor = { kind: 'agent', name: 'kiln' };
const ORIGIN = `http://${LOCAL_HOST}`;
const HEADERS = {
  host: LOCAL_HOST,
  origin: ORIGIN,
  cookie: SESSION_COOKIE,
  'content-type': 'application/json',
};

describe('restarting and reassigning a stuck item', () => {
  let project: Project;
  let server: OteaServer;

  const post = (path: string, payload: unknown = {}, headers: Record<string, string> = {}) =>
    Promise.resolve(
      server.app.request(`/api/items/${path}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { ...HEADERS, ...headers },
      }),
    );
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;
  const events = () => getItem(project, 'TASKS-1').events;

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    const long = () => '2020-01-01T00:00:00.000Z';
    createItem(
      project,
      { collection: 'tasks', title: 'Trot', fields: { description: 'Frames' }, actor: kiln },
      long,
    );
    // A lease that ran out long ago: the item is stuck.
    claimItem(project, { id: 'TASKS-1', actor: kiln, ttlMs: 60_000 }, long);
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('Retomar puts it back in the queue of its step, as the person in the ui', async () => {
    const response = await post('TASKS-1/restart');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'TASKS-1', state: 'todo', lease: null });
    expect(events().at(-1)).toMatchObject({
      type: 'released',
      actor: { kind: 'human', name: 'human' },
      data: { holder: 'kiln', cause: 'restart', channel: 'ui' },
    });
  });

  it('Reasignar leaves it for the agent named', async () => {
    const response = await post('TASKS-1/reassign', { agent: 'quill' });

    expect(response.status).toBe(200);
    expect(events().at(-1)).toMatchObject({
      type: 'released',
      data: { holder: 'kiln', cause: 'reassign', next: 'quill', channel: 'ui' },
    });
  });

  it('refuses a reassign without an agent, and an item that is not stuck', async () => {
    const bare = await post('TASKS-1/reassign', {});
    expect(bare.status).toBe(400);
    expect(await errorOf(bare)).toBe('invalid_body');

    await post('TASKS-1/restart');
    const again = await post('TASKS-1/restart');
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe('not_stuck');
  });

  it('Deshacer gives the lease back, and the item is stuck again', async () => {
    await post('TASKS-1/reassign', { agent: 'quill' });

    const response = await post('TASKS-1/undo', { release: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expiredLease: { holder: 'kiln' } });
    expect(events().at(-1)).toMatchObject({ type: 'claimed', data: { holder: 'kiln' } });
  });

  it('still takes back a move with {"from"}, and refuses a body that is neither', async () => {
    const neither = await post('TASKS-1/undo', { release: false });
    expect(neither.status).toBe(400);
    expect(await errorOf(neither)).toBe('invalid_body');
  });

  it.each([
    ['without a session', { cookie: '' }, 401],
    ['from another site', { origin: 'http://evil.example' }, 403],
  ])('refuses a restart %s', async (_, headers, status) => {
    const response = await post('TASKS-1/restart', {}, headers);
    expect(response.status).toBe(status);
    expect(getItem(project, 'TASKS-1').expiredLease?.holder).toBe('kiln');
  });
});
