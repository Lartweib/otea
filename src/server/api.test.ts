import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject, request } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const bot: Actor = { kind: 'agent', name: 'claude' };

describe('api', () => {
  let project: Project;
  let server: OteaServer;

  const get = (path: string) => request(server, path);
  const ids = async (path: string) =>
    ((await (await get(path)).json()) as Array<{ id: string }>).map((item) => item.id);

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    addCollection(project, { name: 'bugs' });
    createItem(project, {
      collection: 'tasks',
      title: 'Write docs',
      fields: { description: 'For v1' },
      actor: ana,
    });
    createItem(project, {
      collection: 'bugs',
      title: 'Fix login',
      fields: { description: 'Steps' },
      actor: bot,
    });
    moveItem(project, { id: 'BUGS-1', to: 'in_progress', actor: bot, channel: 'cli' });
    moveItem(project, { id: 'BUGS-1', to: 'review', actor: bot, channel: 'cli' });
    server = createServer(project);
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  describe('GET /api/collections', () => {
    it('lists every collection with the preset fields a form needs, without a session', async () => {
      const response = await get('/api/collections');

      expect(response.status).toBe(200);
      const collections = (await response.json()) as Array<{ name: string; fields: unknown[] }>;
      expect(collections.map(({ name }) => name)).toEqual(['tasks', 'bugs']);
      expect(collections[0]).toEqual({
        name: 'tasks',
        prefix: 'TASKS',
        preset: 'tasks',
        initial: 'todo',
        incomplete: 'incomplete',
        fields: [
          { name: 'title', module: 'text', required: 'create' },
          { name: 'description', module: 'markdown', required: 'complete' },
          {
            name: 'priority',
            module: 'enum',
            values: ['low', 'medium', 'high'],
            default: 'medium',
          },
        ],
      });
    });
  });

  describe('GET /api/items', () => {
    it('lists every item with its turn', async () => {
      const response = await get('/api/items');

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject([
        { id: 'TASKS-1', title: 'Write docs', state: 'todo', turn: 'agent' },
        { id: 'BUGS-1', title: 'Fix login', state: 'review', turn: 'human' },
      ]);
    });

    it.each([
      ['?collection=tasks', ['TASKS-1']],
      ['?state=review', ['BUGS-1']],
      ['?turn=human', ['BUGS-1']],
      ['?collection=tasks&turn=human', []],
    ])('filters with %s', async (query, expected) => {
      expect(await ids(`/api/items${query}`)).toEqual(expected);
    });

    it('rejects an unknown turn with 400', async () => {
      const response = await get('/api/items?turn=robot');

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: 'invalid_query', message: 'turn must be one of human, agent, none' },
      });
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns the item with its events', async () => {
      const response = await get('/api/items/BUGS-1');
      const item = (await response.json()) as { events: Array<{ type: string }> };

      expect(response.status).toBe(200);
      expect(item).toMatchObject({ id: 'BUGS-1', state: 'review', turn: 'human' });
      expect(item.events.map((event) => event.type)).toEqual([
        'created',
        'transitioned',
        'transitioned',
      ]);
    });

    it('returns the moves available to the human in the ui', async () => {
      const item = await (await get('/api/items/BUGS-1')).json();

      expect(item).toMatchObject({
        transitions: [
          { to: 'done', by: 'human-ui', reasonRequired: false },
          { to: 'todo', by: 'human-ui', reasonRequired: true },
          { to: 'discarded', by: 'human', reasonRequired: true },
        ],
        missing: [],
      });
    });

    it('returns the fields still missing to complete the item', async () => {
      createItem(project, { collection: 'tasks', title: 'Vague', actor: bot });

      const item = await (await get('/api/items/TASKS-2')).json();

      expect(item).toMatchObject({ state: 'incomplete', missing: ['description'] });
    });

    it('returns the preset fields of the item', async () => {
      const item = await (await get('/api/items/TASKS-1')).json();

      expect(item).toMatchObject({
        fields: { description: 'For v1', priority: 'medium' },
        presetVersion: 1,
      });
    });

    it('returns 404 with the error code for an unknown id', async () => {
      const response = await get('/api/items/TASKS-9');

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: 'not_found', message: 'Item "TASKS-9" not found' },
      });
    });
  });

  it('returns a JSON 404 for an unknown api route', async () => {
    const response = await get('/api/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
