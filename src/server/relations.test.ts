import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, getItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { listRelations } from '../app/relations.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, request, SESSION_COOKIE, TOKEN } from './testing.ts';

const ORIGIN = `http://${LOCAL_HOST}`;

const bot: Actor = { kind: 'agent', name: 'claude' };

describe('relations over the API', () => {
  let project: Project;
  let server: OteaServer;

  const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
    Promise.resolve(
      server.app.request(path, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          host: LOCAL_HOST,
          origin: ORIGIN,
          cookie: SESSION_COOKIE,
          'content-type': 'application/json',
          ...headers,
        },
      }),
    );
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    for (const title of ['Wolf', 'Body', 'Movement']) {
      createItem(project, { collection: 'tasks', title, fields: { description: 'D' }, actor: bot });
    }
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  describe('POST /api/items/:id/link', () => {
    it('links as the human in the ui and returns the relation', async () => {
      const response = await post('/api/items/TASKS-2/link', { kind: 'parent', other: 'TASKS-1' });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        kind: 'parent',
        from: 'TASKS-2',
        to: 'TASKS-1',
        actor: { kind: 'human', name: 'human' },
        channel: 'ui',
      });
      expect(getItem(project, 'TASKS-1').events.at(-1)).toMatchObject({
        type: 'relation_added',
        data: { channel: 'ui' },
      });
    });

    it.each([
      [{ kind: 'blocks', other: 'TASKS-2' }, 400, 'self_relation'],
      [{ kind: 'blocks', other: 'TASKS-9' }, 404, 'not_found'],
      [{ kind: 'sibling', other: 'TASKS-3' }, 400, 'invalid_relation'],
      [{ kind: 'blocks' }, 400, 'invalid_body'],
    ])('refuses %j with %i %s', async (payload, status, code) => {
      const response = await post('/api/items/TASKS-2/link', payload);

      expect(response.status).toBe(status);
      expect(await errorOf(response)).toBe(code);
      expect(listRelations(project)).toEqual([]);
    });

    it('answers a cycle and a second parent with 409', async () => {
      await post('/api/items/TASKS-2/link', { kind: 'parent', other: 'TASKS-1' });

      const second = await post('/api/items/TASKS-2/link', { kind: 'parent', other: 'TASKS-3' });
      const cycle = await post('/api/items/TASKS-1/link', { kind: 'parent', other: 'TASKS-2' });

      expect([second.status, await errorOf(second)]).toEqual([409, 'parent_exists']);
      expect([cycle.status, await errorOf(cycle)]).toEqual([409, 'relation_cycle']);
    });

    it('needs a signed-in browser from its own origin', async () => {
      const anonymous = await post(
        '/api/items/TASKS-2/link',
        { kind: 'relates', other: 'TASKS-3' },
        { cookie: '' },
      );
      const foreign = await post(
        '/api/items/TASKS-2/link',
        { kind: 'relates', other: 'TASKS-3' },
        { origin: 'http://evil.test' },
      );

      expect(anonymous.status).toBe(401);
      expect(foreign.status).toBe(403);
      expect(listRelations(project)).toEqual([]);
    });
  });

  describe('POST /api/items/:id/unlink', () => {
    it('removes the relation, and answers 404 when there is none', async () => {
      await post('/api/items/TASKS-2/link', { kind: 'blocks', other: 'TASKS-3' });

      const removed = await post('/api/items/TASKS-2/unlink', { kind: 'blocks', other: 'TASKS-3' });
      const again = await post('/api/items/TASKS-2/unlink', { kind: 'blocks', other: 'TASKS-3' });

      expect(removed.status).toBe(200);
      expect(await removed.json()).toEqual({ kind: 'blocks', from: 'TASKS-2', to: 'TASKS-3' });
      expect(again.status).toBe(404);
      expect(listRelations(project)).toEqual([]);
    });
  });

  it('creates a child with parent in the create body', async () => {
    const response = await post('/api/items', {
      collection: 'tasks',
      parent: 'TASKS-1',
      fields: { title: 'Animation' },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 'TASKS-4',
      relations: [{ kind: 'parent', id: 'TASKS-1' }],
    });
  });

  it('lists the children of a parent with ?parent=', async () => {
    await post('/api/items/TASKS-3/link', { kind: 'parent', other: 'TASKS-1' });

    const response = await request(server, '/api/items?parent=TASKS-1');

    const items = (await response.json()) as { id: string }[];
    expect(items.map(({ id }) => id)).toEqual(['TASKS-3']);
  });

  it('shows the relations and the children summary of an item', async () => {
    await post('/api/items/TASKS-3/link', { kind: 'parent', other: 'TASKS-1' });

    const response = await request(server, '/api/items/TASKS-1');

    expect(await response.json()).toMatchObject({
      relations: [{ kind: 'child', id: 'TASKS-3', title: 'Movement', turn: 'agent' }],
      children: { total: 1, open: 1, done: 0, discarded: 0 },
    });
  });
});
