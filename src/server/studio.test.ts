import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../app/items.ts';
import { loadPresets } from '../app/presets.ts';
import type { Project } from '../app/project.ts';
import { IDENTITY } from '../app/testing.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import { listCollections } from '../store/queries.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';

const ORIGIN = `http://${LOCAL_HOST}`;

// A project preset as a team writes it, comments and all.
const REVIEWS = `# Rounds of review on art.
preset: reviews
preset_version: 2
playbook: ./playbook.md
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states:
    open: { turn: human }
    closed: { turn: none, closes: discarded }
  transitions:
    - { from: open, to: closed, by: human }
`;

type Json = Record<string, unknown>;

describe('the Studio API', () => {
  let root: string;
  let project: Project;
  let server: OteaServer;

  const dataDir = () => join(root, '.otea');
  const reviewsFile = () => join(dataDir(), 'presets', 'reviews', 'preset.yaml');
  const get = async (path: string) => {
    const response = await server.app.request(`/api${path}`, { headers: { host: LOCAL_HOST } });
    return { status: response.status, body: (await response.json()) as Json };
  };
  const post = async (path: string, payload: unknown, headers: Record<string, string> = {}) => {
    const response = await server.app.request(`/api${path}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        host: LOCAL_HOST,
        origin: ORIGIN,
        cookie: SESSION_COOKIE,
        'content-type': 'application/json',
        ...headers,
      },
    });
    return { status: response.status, body: (await response.json()) as Json };
  };
  const codeOf = (body: Json) => (body.error as { code: string }).code;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-studio-'));
    mkdirSync(join(dataDir(), 'presets', 'reviews'), { recursive: true });
    writeFileSync(reviewsFile(), REVIEWS);
    writeFileSync(join(dataDir(), 'presets', 'reviews', 'playbook.md'), 'Review it.\n');
    const db = openDatabase(':memory:');
    migrate(db);
    project = {
      root,
      dataDir: dataDir(),
      storage: 'local',
      identity: IDENTITY,
      db,
      presets: loadPresets(dataDir()),
    };
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(root, { recursive: true, force: true });
  });

  describe('presets', () => {
    it('lists official and project presets, and those that fail to load with their problems', async () => {
      mkdirSync(join(dataDir(), 'presets', 'broken'));
      writeFileSync(join(dataDir(), 'presets', 'broken', 'preset.yaml'), 'preset: broken\n');
      project.presets = loadPresets(dataDir());

      const { status, body } = await get('/studio/presets');

      expect(status).toBe(200);
      const list = body as unknown as Array<Json>;
      expect(list.find(({ name }) => name === 'tasks')).toMatchObject({
        origin: 'official',
        version: 2,
        problems: [],
      });
      expect(list.find(({ name }) => name === 'reviews')).toMatchObject({
        origin: 'project',
        version: 2,
      });
      expect(list.find(({ name }) => name === 'broken')).toMatchObject({
        origin: 'project',
        version: null,
        problems: expect.arrayContaining([expect.stringContaining('preset_version')]),
      });
    });

    it('reads a preset as its files, an official one as read-only', async () => {
      const official = await get('/studio/presets/tasks');
      const own = await get('/studio/presets/reviews');

      expect(official.body).toMatchObject({ name: 'tasks', origin: 'official', editable: false });
      expect(official.body.yaml).toContain('preset: tasks');
      expect(Object.keys(official.body.playbooks as Json)).toEqual(['./playbook.md']);
      expect(own.body).toMatchObject({
        editable: true,
        yaml: REVIEWS,
        playbooks: { './playbook.md': 'Review it.\n' },
      });
      expect((await get('/studio/presets/nope')).status).toBe(404);
    });

    it('saves a valid draft, raising its version and keeping its comments', async () => {
      const yaml = REVIEWS.replace('open: { turn: human }', 'open: { turn: agent }');

      const { status, body } = await post('/studio/presets/reviews', {
        yaml,
        playbooks: { './playbook.md': 'Review it twice.\n' },
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({ version: 3 });
      const written = readFileSync(reviewsFile(), 'utf8');
      expect(written).toContain('# Rounds of review on art.');
      expect(written).toContain('preset_version: 3');
      expect(written).toContain('open: { turn: agent }');
      expect(readFileSync(join(dataDir(), 'presets', 'reviews', 'playbook.md'), 'utf8')).toBe(
        'Review it twice.\n',
      );
      expect(project.presets.presets.get('reviews')?.version).toBe(3);
    });

    it('leaves the version alone when nothing changed', async () => {
      const { body } = await post('/studio/presets/reviews', { yaml: REVIEWS });

      expect(body).toMatchObject({ version: 2 });
      expect(readFileSync(reviewsFile(), 'utf8')).toBe(REVIEWS);
    });

    it('refuses a draft the core reads as invalid, and writes nothing', async () => {
      const yaml = REVIEWS.replace('by: human', 'by: nobody');

      const { status, body } = await post('/studio/presets/reviews', { yaml });

      expect(status).toBe(422);
      expect(codeOf(body)).toBe('invalid_draft');
      expect(readFileSync(reviewsFile(), 'utf8')).toBe(REVIEWS);
    });

    it('refuses a playbook outside the preset folder, or one the preset does not use', async () => {
      const outside = await post('/studio/presets/reviews', {
        yaml: REVIEWS.replace('./playbook.md', '../../escape.md'),
        playbooks: { '../../escape.md': 'x' },
      });
      const unused = await post('/studio/presets/reviews', {
        yaml: REVIEWS,
        playbooks: { './other.md': 'x' },
      });

      expect(outside.status).toBe(422);
      expect(unused.status).toBe(422);
      expect(existsSync(join(root, 'escape.md'))).toBe(false);
      expect(existsSync(join(dataDir(), 'presets', 'reviews', 'other.md'))).toBe(false);
    });

    it('never writes an official preset', async () => {
      const { yaml } = (await get('/studio/presets/tasks')).body as { yaml: string };

      const { status, body } = await post('/studio/presets/tasks', { yaml });

      expect(status).toBe(403);
      expect(codeOf(body)).toBe('forbidden');
    });

    it('duplicates an official preset into the project at version 1, playbook included', async () => {
      const { status, body } = await post('/studio/presets/tasks/duplicate', { as: 'my-tasks' });

      expect(status).toBe(201);
      expect(body).toMatchObject({ name: 'my-tasks', origin: 'project', version: 1 });
      const dir = join(dataDir(), 'presets', 'my-tasks');
      expect(readFileSync(join(dir, 'preset.yaml'), 'utf8')).toContain('preset: my-tasks');
      expect(existsSync(join(dir, 'playbook.md'))).toBe(true);
      expect(project.presets.presets.get('my-tasks')?.origin).toBe('project');
    });

    it('refuses a duplicate under a name taken, official, or malformed', async () => {
      expect((await post('/studio/presets/tasks/duplicate', { as: 'reviews' })).status).toBe(409);
      expect((await post('/studio/presets/reviews/duplicate', { as: 'tasks' })).status).toBe(409);
      expect((await post('/studio/presets/tasks/duplicate', { as: '../up' })).status).toBe(400);
    });

    it('takes writes only from a signed-in browser on its own origin', async () => {
      const unsigned = await post('/studio/presets/reviews', { yaml: REVIEWS }, { cookie: '' });
      const foreign = await post(
        '/studio/presets/reviews/duplicate',
        { as: 'copy' },
        { origin: 'http://evil.example' },
      );

      expect(unsigned.status).toBe(401);
      expect(foreign.status).toBe(403);
      expect(existsSync(join(dataDir(), 'presets', 'copy'))).toBe(false);
    });
  });

  describe('blueprints', () => {
    const state = async () => (await get('/studio/blueprint')).body;
    const apply = () => post('/studio/blueprint/apply', { name: 'product' });

    it('lists the blueprints a project can use', async () => {
      const { body } = await get('/studio/blueprints');

      expect(body.blueprints).toEqual([
        expect.objectContaining({
          name: 'product',
          origin: 'official',
          boards: [
            { name: 'work', preset: 'tasks' },
            { name: 'bugs', preset: 'bug-triage' },
          ],
          connections: ['bugs.bug blocks work.task'],
        }),
      ]);
    });

    it('applies a blueprint by name and reports its copy as up to date', async () => {
      expect(await state()).toEqual({ blueprint: null, problems: [] });

      const { status } = await apply();

      expect(status).toBe(201);
      expect(listCollections(project.db).map(({ name }) => name)).toEqual(['work', 'bugs']);
      expect(await state()).toMatchObject({
        blueprint: {
          name: 'product',
          boards: [
            { name: 'work', preset: 'tasks', items: 0 },
            { name: 'bugs', preset: 'bug-triage', items: 0 },
          ],
          connections: ['bugs.bug blocks work.task'],
          status: { upToDate: true, changes: [] },
        },
      });
      expect((await apply()).status).toBe(409);
    });

    it('never applies a blueprint by path', async () => {
      const { status } = await post('/studio/blueprint/apply', { name: '../blueprints/product' });

      expect(status).toBe(400);
    });

    it('edits the copy: a new board builds its collection, and status shows what differs', async () => {
      await apply();

      const { status, body } = await post('/studio/blueprint', {
        boards: [
          { name: 'work', preset: 'tasks' },
          { name: 'bugs', preset: 'bug-triage' },
          { name: 'art', preset: 'tasks' },
        ],
        connections: ['bugs.bug blocks work.task', 'art.task relates work.task'],
        playbook: 'Work together.\n',
      });

      expect(status).toBe(200);
      expect(body.applied).toEqual(['Created board art (preset tasks)']);
      expect(listCollections(project.db).map(({ name }) => name)).toContain('art');
      expect(project.blueprint?.connections).toHaveLength(2);
      expect(readFileSync(join(dataDir(), 'blueprint.md'), 'utf8')).toBe('Work together.\n');
      expect((body.blueprint as Json).status).toMatchObject({
        upToDate: false,
        changes: expect.arrayContaining(['- board art (preset tasks)', '~ playbook']),
      });
    });

    it('refuses an edit the core reads as invalid, or one that would drop a board with items', async () => {
      await apply();
      createItem(project, {
        collection: 'bugs',
        title: 'Crash',
        fields: {},
        actor: { kind: 'human', name: 'human' },
        channel: 'ui',
      });

      const parent = await post('/studio/blueprint', {
        boards: [
          { name: 'work', preset: 'tasks' },
          { name: 'bugs', preset: 'bug-triage' },
        ],
        connections: ['bugs.bug parent work.task'],
        playbook: null,
      });
      const dropped = await post('/studio/blueprint', {
        boards: [{ name: 'work', preset: 'tasks' }],
        connections: [],
        playbook: null,
      });

      expect(parent.status).toBe(422);
      expect(codeOf(parent.body)).toBe('invalid_draft');
      expect(dropped.status).toBe(409);
      expect(codeOf(dropped.body)).toBe('in_use');
      expect(listCollections(project.db).map(({ name }) => name)).toEqual(['work', 'bugs']);
    });

    it('updates the copy from its source', async () => {
      await apply();
      await post('/studio/blueprint', {
        boards: [
          { name: 'work', preset: 'tasks' },
          { name: 'bugs', preset: 'bug-triage' },
        ],
        connections: [],
        playbook: null,
      });

      const { status, body } = await post('/studio/blueprint/update', {});

      expect(status).toBe(200);
      expect(body.applied).toContain('Allowed bugs.bug blocks work.task');
      expect(await state()).toMatchObject({ blueprint: { status: { upToDate: true } } });
    });
  });
});
