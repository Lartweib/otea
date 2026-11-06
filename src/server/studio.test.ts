import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
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

  describe('creating and deleting presets', () => {
    it('creates a blank project preset that loads with no notes', async () => {
      const { status, body } = await post('/studio/presets', { name: 'notes' });

      expect(status).toBe(201);
      expect(body).toMatchObject({
        name: 'notes',
        origin: 'project',
        editable: true,
        version: 1,
        problems: [],
        notes: [],
      });
      expect(readFileSync(join(dataDir(), 'presets', 'notes', 'preset.yaml'), 'utf8')).toContain(
        'preset: notes',
      );
      expect(project.presets.presets.get('notes')?.origin).toBe('project');
    });

    it('refuses a blank preset under a name taken, official, or malformed', async () => {
      expect((await post('/studio/presets', { name: 'reviews' })).status).toBe(409);
      expect((await post('/studio/presets', { name: 'tasks' })).status).toBe(409);
      expect((await post('/studio/presets', { name: '../up' })).status).toBe(400);
    });

    it('deletes a project preset that no collection uses, files and all', async () => {
      const { status, body } = await post('/studio/presets/reviews/delete', {});

      expect(status).toBe(200);
      expect(body).toEqual({ deleted: 'reviews' });
      expect(existsSync(join(dataDir(), 'presets', 'reviews'))).toBe(false);
      expect(project.presets.presets.has('reviews')).toBe(false);
    });

    it('keeps a preset a collection uses, and every official one', async () => {
      addCollection(project, { name: 'art', preset: 'reviews' });

      const used = await post('/studio/presets/reviews/delete', {});
      const official = await post('/studio/presets/tasks/delete', {});

      expect(used.status).toBe(409);
      expect(codeOf(used.body)).toBe('in_use');
      expect(official.status).toBe(403);
      expect(existsSync(reviewsFile())).toBe(true);
    });

    it('takes both only from the signed-in browser on this computer', async () => {
      const created = await post('/studio/presets', { name: 'notes' }, { cookie: '' });
      const deleted = await post('/studio/presets/reviews/delete', {}, { cookie: '' });

      expect(created.status).toBe(401);
      expect(deleted.status).toBe(401);
      expect(existsSync(reviewsFile())).toBe(true);
    });
  });

  describe('samples', () => {
    const SAMPLES = 'samples:\n  - { id: REV-1, title: Round one, state: open }\n';
    const samplesFile = () => join(dataDir(), 'presets', 'reviews', 'samples.yaml');
    const raw = (path: string) =>
      server.app.request(`/api${path}`, { headers: { host: LOCAL_HOST } });

    it("reads an official preset's samples, each read against the preset", async () => {
      const { status, body } = await get('/studio/presets/bug-triage/samples');

      expect(status).toBe(200);
      expect(body.notes).toEqual([]);
      expect(body.yaml).toContain('Wall-slide jump drops the buffered input');
      expect(body.files).toEqual(expect.arrayContaining(['wall-slide-before.png']));
      const samples = body.samples as Array<Json>;
      expect(
        samples.find(({ title }) => title === 'Wall-slide jump drops the buffered input'),
      ).toMatchObject({
        type: 'bug',
        fields: { severity: 'high' },
        evidence: [
          expect.objectContaining({ file: 'wall-slide-before.png', role: 'before' }),
          expect.objectContaining({ file: 'wall-slide-after.png', role: 'after' }),
        ],
      });
    });

    it('reads no samples from a preset without them', async () => {
      expect((await get('/studio/presets/reviews/samples')).body).toEqual({
        yaml: null,
        files: [],
        samples: [],
        notes: [],
      });
    });

    it('serves a sample file as what it is, and nothing outside the samples folder', async () => {
      const image = await raw('/studio/presets/bug-triage/samples/wall-slide-before.png');
      const bytes = new Uint8Array(await image.arrayBuffer());

      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/png');
      expect(image.headers.get('x-content-type-options')).toBe('nosniff');
      expect([...bytes.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG');
      expect((await raw('/studio/presets/bug-triage/samples/nope.png')).status).toBe(404);
      expect((await raw('/studio/presets/bug-triage/samples/..%2Fpreset.yaml')).status).toBe(404);
    });

    it('saves samples with the preset, without raising its version, and notes what misfits', async () => {
      const samples = `${SAMPLES}  - { id: REV-2, title: Round two, state: nowhere }\n`;

      const { status, body } = await post('/studio/presets/reviews', { yaml: REVIEWS, samples });

      expect(status).toBe(200);
      expect(body).toMatchObject({ version: 2 });
      expect(readFileSync(samplesFile(), 'utf8')).toBe(samples);
      expect(body.notes).toEqual([
        // A review opens in the human's turn, and from chat it can only be thrown away.
        expect.objectContaining({ code: 'state_stuck_in_chat', file: 'preset.yaml' }),
        expect.objectContaining({
          file: 'samples.yaml',
          code: 'sample_unknown_state',
          path: { section: 'samples', index: 1, type: 'item', state: 'nowhere' },
        }),
      ]);
      const read = (await get('/studio/presets/reviews/samples')).body;
      expect((read.samples as Json[]).map(({ id }) => id)).toEqual(['REV-1', 'REV-2']);
    });

    it('duplicates a preset with its samples and their files', async () => {
      await post('/studio/presets/bug-triage/duplicate', { as: 'game-bugs' });

      const dir = join(dataDir(), 'presets', 'game-bugs');
      expect(existsSync(join(dir, 'samples.yaml'))).toBe(true);
      expect(existsSync(join(dir, 'samples', 'wall-slide-before.png'))).toBe(true);
      expect((await get('/studio/presets/game-bugs/samples')).body.notes).toEqual([]);
    });

    it('takes samples only from a signed-in browser', async () => {
      const { status } = await post(
        '/studio/presets/reviews',
        { yaml: REVIEWS, samples: SAMPLES },
        { cookie: '' },
      );

      expect(status).toBe(401);
      expect(existsSync(samplesFile())).toBe(false);
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

    it("copies a board's preset into the project and points the board at the copy", async () => {
      await apply();

      const { status, body } = await post('/studio/blueprint/boards/work/copy-preset', {
        as: 'game-tasks',
      });

      expect(status).toBe(201);
      expect(body).toMatchObject({
        board: 'work',
        preset: {
          name: 'game-tasks',
          origin: 'project',
          version: 1,
          collections: [{ name: 'work' }],
        },
      });
      expect(await state()).toMatchObject({
        blueprint: { boards: [{ name: 'work', preset: 'game-tasks' }, { name: 'bugs' }] },
      });
    });

    it('takes a board copy only from a signed-in browser on its own origin', async () => {
      await apply();
      const path = '/studio/blueprint/boards/work/copy-preset';

      expect((await post(path, { as: 'game-tasks' }, { cookie: '' })).status).toBe(401);
      expect(
        (await post(path, { as: 'game-tasks' }, { origin: 'http://evil.example' })).status,
      ).toBe(403);
      expect((await post(path, { as: '../up' })).status).toBe(400);
      expect(existsSync(join(dataDir(), 'presets', 'game-tasks'))).toBe(false);
    });

    describe('customize and revert', () => {
      const tasksYaml = async () =>
        ((await get('/studio/presets/tasks')).body.yaml as string) ?? '';
      const labelled = (yaml: string) =>
        yaml.replace(/(\n {2}title: \{[^}]*)\}/, '$1, label: Name }');

      it("copies an official preset on the first customization, then saves the copy's versions", async () => {
        await apply();
        const yaml = labelled(await tasksYaml());
        expect(yaml).toContain('label: Name');

        const first = await post('/studio/boards/work/customize', { yaml });

        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
          preset: 'work-tasks',
          previous: { preset: 'tasks', yaml: await tasksYaml() },
        });
        expect(await state()).toMatchObject({
          blueprint: { boards: [{ name: 'work', preset: 'work-tasks' }, { name: 'bugs' }] },
        });

        const second = await post('/studio/boards/work/customize', {
          yaml: yaml.replace('label: Name', 'label: Heading'),
        });
        expect(second.body).toMatchObject({ preset: 'work-tasks' });
        expect(second.body.version).toBe((first.body.version as number) + 1);
        expect((second.body.previous as { preset: string }).preset).toBe('work-tasks');
      });

      it('puts back what customize returned', async () => {
        await apply();
        const original = await tasksYaml();
        const { body } = await post('/studio/boards/work/customize', {
          yaml: labelled(original),
        });

        const reverted = await post('/studio/boards/work/revert', { previous: body.previous });

        expect(reverted.status).toBe(200);
        expect(await state()).toMatchObject({
          blueprint: { boards: [{ name: 'work', preset: 'tasks' }, { name: 'bugs' }] },
        });
        expect(existsSync(join(dataDir(), 'presets', 'work-tasks'))).toBe(false);
      });

      it('takes them only from a signed-in browser on its own origin, with a valid body', async () => {
        await apply();
        const yaml = await tasksYaml();
        for (const [path, payload] of [
          ['/studio/boards/work/customize', { yaml }],
          ['/studio/boards/work/revert', { previous: { preset: 'tasks', yaml } }],
        ] as const) {
          expect((await post(path, payload, { cookie: '' })).status).toBe(401);
          expect((await post(path, payload, { origin: 'http://evil.example' })).status).toBe(403);
        }
        expect((await post('/studio/boards/Bad_Name/customize', { yaml })).status).toBe(400);
        expect((await post('/studio/boards/work/customize', {})).status).toBe(400);
        expect((await post('/studio/boards/work/customize', { yaml: 'preset: nope' })).status).toBe(
          422,
        );
        expect(existsSync(join(dataDir(), 'presets', 'work-tasks'))).toBe(false);
      });
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
