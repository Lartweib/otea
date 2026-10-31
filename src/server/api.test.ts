import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import type { Project } from '../app/project.ts';
import { REVIEWS } from '../app/testing.ts';
import type { Actor } from '../core/item.ts';
import { parsePreset } from '../core/preset.ts';
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
    it('lists every collection with the preset types a form needs, without a session', async () => {
      const response = await get('/api/collections');

      expect(response.status).toBe(200);
      const collections = (await response.json()) as Array<{ name: string; types: unknown[] }>;
      expect(collections.map(({ name }) => name)).toEqual(['tasks', 'bugs']);
      expect(collections[0]).toMatchObject({
        name: 'tasks',
        prefix: 'TASKS',
        preset: 'tasks',
        view: { kind: 'list', groupBy: 'turn' },
      });
      expect(collections[0]?.types).toEqual([
        expect.objectContaining({
          name: 'item',
          label: 'Item',
          initial: 'todo',
          incomplete: 'incomplete',
          layout: expect.objectContaining({ body: expect.any(Array) }),
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
        }),
      ]);
    });
  });

  describe('GET /api/presets', () => {
    it('lists every loaded preset with its fields and collections, without a session', async () => {
      const response = await get('/api/presets');

      expect(response.status).toBe(200);
      const presets = (await response.json()) as Array<{ name: string; fields: unknown[] }>;
      expect(presets.map(({ name }) => name)).toEqual(['bug-triage', 'tasks']);
      expect(presets[0]?.fields).toContainEqual({
        name: 'severity',
        module: 'severity',
        required: 'complete',
        values: ['low', 'medium', 'high', 'critical'],
      });
      expect(presets[1]).toMatchObject({
        types: [expect.objectContaining({ name: 'item', layout: expect.any(Object) })],
        view: { kind: 'list', groupBy: 'turn' },
      });
      expect({ ...presets[1], types: undefined, view: undefined }).toEqual({
        types: undefined,
        view: undefined,
        name: 'tasks',
        version: 1,
        origin: 'official',
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
        collections: ['tasks', 'bugs'],
      });
    });

    it('includes project presets with their origin', async () => {
      const reviews = memoryProject(REVIEWS);
      const withReviews = createServer(reviews);

      const presets = (await (await request(withReviews, '/api/presets')).json()) as Array<{
        name: string;
        origin: string;
      }>;

      expect(presets.map(({ name, origin }) => ({ name, origin }))).toEqual([
        { name: 'bug-triage', origin: 'official' },
        { name: 'tasks', origin: 'official' },
        { name: 'reviews', origin: 'project' },
      ]);
      withReviews.close();
      reviews.db.close();
    });

    it('sends the icon of each type that has one, and none for a type without', async () => {
      const icons = parsePreset(`
preset: icons
preset_version: 1
fields: { title: { module: text, required: create } }
workflow:
  initial: open
  states: { open: { turn: human }, closed: { turn: none, closes: done } }
  transitions: [{ from: open, to: closed, by: human }]
types:
  bug: { label: Bug, icon: bug }
  note: { label: Note }
`);
      const withIcons = memoryProject(icons);
      addCollection(withIcons, { name: 'mixed', preset: 'icons' });
      const app = createServer(withIcons);
      const typesOf = async (path: string, name: string) =>
        (
          (await (await request(app, path)).json()) as Array<{ name: string; types: object[] }>
        ).find((each) => each.name === name)?.types;

      for (const [path, name] of [
        ['/api/presets', 'icons'],
        ['/api/collections', 'mixed'],
      ] as const) {
        const [bug, note] = (await typesOf(path, name)) ?? [];
        expect(bug).toMatchObject({ name: 'bug', label: 'Bug', icon: 'bug' });
        expect(note).toMatchObject({ name: 'note', label: 'Note' });
        expect(note).not.toHaveProperty('icon');
      }
      app.close();
      withIcons.db.close();
    });

    it('is behind the host guard like every other route', async () => {
      const response = await request(server, '/api/presets', 'evil.example:4400');

      expect(response.status).toBe(403);
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

    it('includes the active lease of each item', async () => {
      const { lease } = claimItem(project, { id: 'TASKS-1', actor: bot });

      expect(await (await get('/api/items')).json()).toMatchObject([
        { id: 'TASKS-1', lease: { holder: 'claude', expiresAt: lease?.expiresAt } },
        { id: 'BUGS-1', lease: null },
      ]);
    });

    it.each([
      ['?collection=tasks', ['TASKS-1']],
      ['?state=review', ['BUGS-1']],
      ['?turn=human', ['BUGS-1']],
      ['?collection=tasks&turn=human', []],
      ['?type=item', ['TASKS-1', 'BUGS-1']],
      ['?type=bug', []],
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

    it('returns the active lease of the item', async () => {
      claimItem(project, { id: 'TASKS-1', actor: bot });

      expect(await (await get('/api/items/TASKS-1')).json()).toMatchObject({
        lease: { holder: 'claude' },
        events: [{ type: 'created' }, { type: 'claimed', data: { holder: 'claude' } }],
      });
      expect(await (await get('/api/items/BUGS-1')).json()).toMatchObject({ lease: null });
    });

    it('returns the moves available to the human in the ui', async () => {
      const item = await (await get('/api/items/BUGS-1')).json();

      expect(item).toMatchObject({
        transitions: [
          { to: 'done', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
          { to: 'todo', by: 'human-ui', reasonRequired: true, turn: 'agent' },
          { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
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
