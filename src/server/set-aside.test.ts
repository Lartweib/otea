import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, getItem } from '../app/items.ts';
import { claimItem, releaseItem } from '../app/leases.ts';
import type { Project } from '../app/project.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// P7-R3-1: the desk said «Espera a un agente» on an item its only agent had set aside for later,
// with no sign of it. The lists and the item page say who set it aside, and Retomar
// (POST /api/items/:id/resume) takes it up again.

const kiln: Actor = { kind: 'agent', name: 'kiln' };
const HEADERS = {
  host: LOCAL_HOST,
  origin: `http://${LOCAL_HOST}`,
  cookie: SESSION_COOKIE,
  'content-type': 'application/json',
};
const AT = '2026-11-19T09:00:00.000Z';

describe('an item set aside for later, on the desk', () => {
  let project: Project;
  let server: OteaServer;

  const api = (path: string, method = 'GET') =>
    Promise.resolve(
      server.app.request(`/p/memory-aaaaaa/api/${path}`, {
        method,
        ...(method === 'POST' ? { body: '{}' } : {}),
        headers: HEADERS,
      }),
    );
  const listed = async () =>
    ((await (await api('items')).json()) as { id: string; setAside?: unknown }[]).find(
      ({ id }) => id === 'TASKS-1',
    );

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    createItem(
      project,
      { collection: 'tasks', title: 'Trot', fields: { description: 'Frames' }, actor: kiln },
      () => AT,
    );
    claimItem(project, { id: 'TASKS-1', actor: kiln }, () => AT);
    releaseItem(project, { id: 'TASKS-1', actor: kiln, later: true }, () => AT);
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('says who set it aside, in the list and on the item', async () => {
    expect((await listed())?.setAside).toEqual({ by: 'kiln', at: AT });
    const item = (await (await api('items/TASKS-1')).json()) as { setAside?: unknown };
    expect(item.setAside).toEqual({ by: 'kiln', at: AT });
  });

  it('takes it up again with Retomar, as the person, and refuses it once nothing is set aside', async () => {
    const resumed = await api('items/TASKS-1/resume', 'POST');

    expect(resumed.status).toBe(200);
    expect(await listed()).not.toHaveProperty('setAside');
    expect(getItem(project, 'TASKS-1').events.at(-1)).toMatchObject({
      type: 'set_aside_lifted',
      actor: { kind: 'human', name: 'human' },
      data: { by: 'kiln', cause: 'resume', channel: 'ui' },
    });
    const again = await api('items/TASKS-1/resume', 'POST');
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      error: { code: 'invalid_transition', details: { kind: 'not_set_aside', item: 'TASKS-1' } },
    });
  });
});
