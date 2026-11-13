import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection, setCollectionIcon } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import { CLI_HARNESS, seeAgent } from '../app/presence.ts';
import { type Project, setProjectIcon } from '../app/project.ts';
import { REVIEWS } from '../app/testing.ts';
import type { Actor } from '../core/item.ts';
import { parsePreset } from '../core/preset.ts';
import { insertProjectIdentity } from '../store/queries.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject, request } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const bot: Actor = { kind: 'agent', name: 'claude' };

const T0 = '2026-01-01T00:00:00.000Z';

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

  it('GET /api/project returns the project identity without a session', async () => {
    const response = await get('/api/project');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...project.identity, icon: null });
  });

  it('GET /api/project carries the icon the project was given', async () => {
    insertProjectIdentity(project.db, project.identity);
    setProjectIcon(project, 'rocket');

    expect(await (await get('/api/project')).json()).toEqual({
      ...project.identity,
      icon: 'rocket',
    });
  });

  describe('GET /api/agents', () => {
    it('lists the agents seen, live first, with their harness and holds, without a session', async () => {
      const recently = new Date(Date.now() - 60_000).toISOString();
      seeAgent(project.db, { agent: 'codex', channel: 'cli', harness: CLI_HARNESS }, () => T0);
      seeAgent(
        project.db,
        { agent: 'claude', channel: 'mcp', harness: { name: 'claude-code', version: '2.1.0' } },
        () => recently,
      );
      claimItem(project, { id: 'TASKS-1', actor: bot });

      const response = await get('/api/agents');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        agents: [
          {
            name: 'claude',
            harness: 'claude-code',
            holding: ['TASKS-1'],
            lastSeen: recently,
            live: true,
          },
          { name: 'codex', harness: 'cli', holding: [], lastSeen: T0, live: false },
        ],
      });
    });

    it('lists no one before an agent is seen', async () => {
      const empty = createServer(memoryProject());

      expect(await (await request(empty, '/api/agents')).json()).toEqual({ agents: [] });
      empty.close();
    });
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
          name: 'task',
          label: 'Task',
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
          // The preset's words in Spanish ride along; the keys above stay as they are.
          labels: expect.objectContaining({
            es: expect.objectContaining({
              label: 'Tarea',
              states: expect.objectContaining({ in_progress: 'En curso' }),
              fields: expect.objectContaining({ priority: 'Prioridad' }),
            }),
          }),
        }),
      ]);
    });
  });

  describe('GET /api/collections icons', () => {
    it("gives each collection its own icon, or else its preset's", async () => {
      addCollection(project, { name: 'triage', preset: 'bug-triage' });
      addCollection(project, { name: 'roadmap', preset: 'tasks', icon: 'map' });
      setCollectionIcon(project, 'bugs', 'rocket');

      const collections = (await (await get('/api/collections')).json()) as Array<{
        name: string;
        icon: string | null;
      }>;

      expect(collections.map(({ name, icon }) => [name, icon])).toEqual([
        ['tasks', 'checklist'],
        ['bugs', 'rocket'],
        ['triage', 'bug'],
        ['roadmap', 'map'],
      ]);
    });

    it('gives no icon to a collection whose preset has none', async () => {
      const reviews = memoryProject(REVIEWS);
      addCollection(reviews, { name: 'reviews', preset: 'reviews' });
      const withReviews = createServer(reviews);

      const [collection] = (await (await request(withReviews, '/api/collections')).json()) as {
        icon: string | null;
      }[];

      expect(collection?.icon).toBeNull();
      withReviews.close();
    });
  });

  describe('GET /api/presets', () => {
    it('lists every loaded preset with its fields and collections, without a session', async () => {
      const response = await get('/api/presets');

      expect(response.status).toBe(200);
      const presets = (await response.json()) as Array<{ name: string; fields: unknown[] }>;
      expect(presets.map(({ name }) => name)).toEqual([
        'architecture',
        'bug-triage',
        'change',
        'review',
        'tasks',
      ]);
      expect(presets[1]?.fields).toContainEqual({
        name: 'severity',
        module: 'severity',
        required: 'complete',
        values: ['low', 'medium', 'high', 'critical'],
      });
      expect(presets[4]).toMatchObject({
        types: [
          expect.objectContaining({
            name: 'task',
            layout: expect.any(Object),
            labels: expect.objectContaining({ es: expect.objectContaining({ label: 'Tarea' }) }),
          }),
        ],
        view: { kind: 'list', groupBy: 'turn' },
      });
      expect({ ...presets[4], types: undefined, view: undefined }).toEqual({
        types: undefined,
        view: undefined,
        name: 'tasks',
        names: { en: 'Tasks', es: 'Tareas' },
        version: 2,
        origin: 'official',
        icon: 'checklist',
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
        { name: 'architecture', origin: 'official' },
        { name: 'bug-triage', origin: 'official' },
        { name: 'change', origin: 'official' },
        { name: 'review', origin: 'official' },
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
      ['?type=task', ['TASKS-1', 'BUGS-1']],
      ['?type=bug', []],
      ['?field=priority=medium', ['TASKS-1', 'BUGS-1']],
      ['?field=priority=medium&field=title=Fix%20login', ['BUGS-1']],
      ['?field=priority=high&field=title=Fix%20login', []],
    ])('filters with %s', async (query, expected) => {
      expect(await ids(`/api/items${query}`)).toEqual(expected);
    });

    it('rejects a field that is not key=value with 400', async () => {
      const response = await get('/api/items?field=priority');

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: 'invalid_query', message: 'field expects key=value, got "priority"' },
      });
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
    it('answers which gated actions the item allows, only when its workflow has gates', async () => {
      addCollection(project, { name: 'changes', preset: 'change' });
      const change = { collection: 'changes', type: 'change', title: 'Rotate keys', actor: ana };
      const { id } = createItem(project, change);
      createItem(project, {
        collection: 'changes',
        type: 'repo_task',
        parent: id,
        title: 'Rotate keys in api',
        fields: { repo: 'api', branch: 'chg-1/rotate-keys' },
        actor: bot,
      });

      expect(await (await get('/api/items/CHANGES-2')).json()).toMatchObject({
        gates: { push: false, merge: false },
      });
      expect(await (await get('/api/items/CHANGES-1')).json()).not.toHaveProperty('gates');
      expect(await (await get('/api/items/TASKS-1')).json()).not.toHaveProperty('gates');
    });

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
        presetVersion: 2,
      });
    });

    it('returns 404 with the error code for an unknown id', async () => {
      const response = await get('/api/items/TASKS-9');

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: 'not_found',
          message: 'Item "TASKS-9" not found',
          details: { kind: 'item_missing', item: 'TASKS-9' },
        },
      });
    });
  });

  describe('GET /api/events', () => {
    const summary = async (path: string) =>
      ((await (await get(path)).json()) as Array<{ id: number; itemId: string; type: string }>).map(
        ({ id, itemId, type }) => `${id} ${itemId} ${type}`,
      );

    it('lists the event log across items in commit order, without a session', async () => {
      expect(await summary('/api/events')).toEqual([
        '1 TASKS-1 created',
        '2 BUGS-1 created',
        '3 BUGS-1 transitioned',
        '4 BUGS-1 transitioned',
      ]);
    });

    it('reads after a cursor, by item or collection, and the newest with latest', async () => {
      expect(await summary('/api/events?since=3')).toEqual(['4 BUGS-1 transitioned']);
      expect(await summary('/api/events?collection=tasks')).toEqual(['1 TASKS-1 created']);
      expect(await summary('/api/events?item=BUGS-1&limit=1')).toEqual(['2 BUGS-1 created']);
      expect(await summary('/api/events?latest=2')).toEqual([
        '3 BUGS-1 transitioned',
        '4 BUGS-1 transitioned',
      ]);
    });

    it('rejects a cursor or a count that is not a whole number with 400', async () => {
      for (const query of ['since=-1', 'limit=0', 'latest=ten', 'limit=2&latest=2']) {
        const response = await get(`/api/events?${query}`);

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: 'invalid_query' } });
      }
    });

    it('returns 404 for an unknown collection', async () => {
      expect((await get('/api/events?collection=nope')).status).toBe(404);
    });
  });

  it('returns a JSON 404 for an unknown api route', async () => {
    const response = await get('/api/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
