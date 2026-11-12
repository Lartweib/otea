import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { createItem } from '../app/items.ts';
import { initProject, openProject, type Project } from '../app/project.ts';
import { cliAt } from '../cli/testing.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { creatures } from '../core/board/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const ORIGIN = `http://${LOCAL_HOST}`;

type Json = Record<string, unknown>;

describe('the boards API', () => {
  let project: Project;
  let server: OteaServer;

  const call = async (method: string, path: string, payload?: unknown) => {
    const response = await server.app.request(`/api${path}`, {
      method,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      headers: {
        host: LOCAL_HOST,
        origin: ORIGIN,
        cookie: SESSION_COOKIE,
        'content-type': 'application/json',
      },
    });
    return { status: response.status, body: (await response.json()) as Json };
  };

  beforeEach(() => {
    project = memoryProject();
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('lists the templates in the language asked for', async () => {
    const { status, body } = await call('GET', '/templates?lang=es');
    expect(status).toBe(200);
    const templates = body.templates as Json[];
    expect(templates.map(({ key }) => key)).toEqual([
      'bugs',
      'assets',
      'blog',
      'tasks',
      'research',
    ]);
    expect(templates[3]?.name).toBe('Tareas simples');
  });

  it('creates a board with any name, saves its draft, plans and publishes it, and undoes that', async () => {
    const created = await call('POST', '/boards', { name: 'Tareas Ñandú', lang: 'es' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const list = await call('GET', '/boards');
    expect((list.body.boards as Json[]).map(({ name, status }) => `${name}:${status}`)).toEqual([
      'Tareas Ñandú:draft',
    ]);

    const saved = await call('PUT', `/boards/${id}/draft`, {
      definition: { ...creatures(), name: 'Tareas Ñandú' },
      baseVersion: null,
    });
    expect(saved.status).toBe(200);
    expect((saved.body.problems as Json[]).map(({ code }) => code)).toEqual([
      'agent_offline',
      'agent_offline',
    ]);

    const plan = await call('POST', `/boards/${id}/publish/plan`);
    expect(plan.body).toEqual(expect.objectContaining({ from: null, to: 1 }));

    const published = await call('POST', `/boards/${id}/publish`, { moves: {} });
    expect(published.status).toBe(200);
    expect(published.body.version).toBe(1);

    const read = await call('GET', `/boards/${id}`);
    expect(read.body).toEqual(
      expect.objectContaining({
        record: expect.objectContaining({ collection: 'Tareas Ñandú', draft: null }),
        problems: expect.any(Array),
      }),
    );

    const undone = await call('POST', `/boards/${id}/restore`, { version: null });
    expect(undone.status).toBe(200);
    expect(undone.body.live).toBeNull();

    const discarded = await call('DELETE', `/boards/${id}/draft`);
    expect(discarded.body).toEqual({ deleted: true });
  });

  it('answers a bad request in words, never a bare failure', async () => {
    const missing = await call('GET', '/boards/bnope');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toEqual(expect.objectContaining({ code: 'not_found' }));
    const unnamed = await call('POST', '/boards', { name: ' ', lang: 'es' });
    expect(unnamed.status).toBe(400);
    expect((unnamed.body.error as Json).message).toBe('A board needs a name');
    const shape = await call('POST', '/boards', { lang: 'es' });
    expect(shape.status).toBe(400);
  });

  it('refuses an agent draft without a body, a name, or for evidence it does not have', async () => {
    expect((await call('POST', '/boards/agent-draft', {})).status).toBe(400);
    const nameless = await call('POST', '/boards/agent-draft', {
      name: ' ',
      need: 'x',
      agent: null,
      lang: 'es',
    });
    expect(nameless.status).toBe(400);
    const { id } = (await call('POST', '/boards', { name: 'X', lang: 'es' })).body as {
      id: string;
    };
    const merge = await call('POST', `/boards/${id}/draft/merge`, { evidence: 7 });
    expect(merge.status).toBe(404);
    expect((merge.body.error as Json).message).toContain('is not a draft handed in for this board');
  });
});

// "Que lo esboce un agente", the whole loop: the person asks through the API, the agent reads the
// draft and hands its board.json in with the CLI, the person merges it.
describe('an agent drafting a board', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('goes from waiting to a draft with what the agent added', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-agent-draft-')));
    dirs.push(dir);
    const serving = initProject(dir, { local: true });
    const server = createServer(serving, { token: TOKEN });
    const call = async (method: string, path: string, payload?: unknown) => {
      const response = await server.app.request(`/api${path}`, {
        method,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        headers: {
          host: LOCAL_HOST,
          origin: ORIGIN,
          cookie: SESSION_COOKIE,
          'content-type': 'application/json',
        },
      });
      return { status: response.status, body: (await response.json()) as Json };
    };
    const otea = cliAt(dir);
    try {
      const asked = await call('POST', '/boards/agent-draft', {
        name: 'Criaturas',
        need: 'Criaturas del pantano',
        agent: 'kiln',
        lang: 'es',
      });
      expect(asked.status).toBe(201);
      const item = asked.body.item as string;
      const boardId = (asked.body.board as Json).id as string;
      const status = async () =>
        ((await call('GET', '/boards')).body.boards as Json[]).find(({ id }) => id === boardId);
      expect(await status()).toMatchObject({ status: 'waiting', requestItem: item });

      const start = await otea('board', 'draft', item, '--as', 'kiln');
      expect(start.code).toBe(0);
      const draft = JSON.parse(start.out) as BoardDefinition;
      const [first] = draft.steps;
      draft.parts.eart = {
        id: 'eart',
        name: 'Arte conceptual',
        kind: 'images',
        hint: '',
        options: [],
      };
      draft.steps = [
        {
          ...(first as BoardDefinition['steps'][number]),
          id: 'sconcept',
          name: 'Concepto',
          hand: [{ ref: 'eart', req: 'always', fresh: true }],
        },
        ...draft.steps,
      ];
      writeFileSync(join(dir, 'board.json'), JSON.stringify(draft));
      const handed = await otea(
        'board',
        'draft',
        item,
        '--file',
        'board.json',
        '--as',
        'kiln',
        '--json',
      );
      expect(handed.code, handed.err).toBe(0);
      const { evidence } = JSON.parse(handed.out) as { evidence: { id: number } };

      // Handing it in merges it: the home sees it arrive, the editor opens it with the note.
      expect(await status()).toMatchObject({ status: 'draft' });
      const record = (await call('GET', `/boards/${boardId}`)).body.record as Json;
      expect((record.draft as Json).agentNote).toEqual([
        '+ paso Concepto',
        '+ evidencia Arte conceptual',
      ]);
      // The person can merge the same file again by id.
      const merged = await call('POST', `/boards/${boardId}/draft/merge`, {
        evidence: evidence.id,
      });
      expect(merged.status).toBe(200);
      expect(await status()).toMatchObject({ status: 'draft' });
    } finally {
      server.close();
      serving.db.close();
    }
  });
});

// A board published by another process (the browser's server, the CLI) reaches a long-lived server
// on its next request, without a restart.
describe('a board published elsewhere', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('is read by the next items request of a server opened before it', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-sync-')));
    dirs.push(dir);
    const serving = initProject(dir, { local: true });
    const server = createServer(serving, { token: TOKEN });
    const other = openProject(dir);
    try {
      const record = createBoard(other, { name: 'Criaturas', lang: 'es' });
      saveDraft(other, record.id, { definition: creatures(), baseVersion: null });
      publishBoard(other, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
      const item = createItem(other, {
        collection: 'Criaturas',
        title: 'Tortuga',
        fields: { fdesc: 'Lenta' },
        actor: { kind: 'human', name: 'fede' },
        channel: 'ui',
      });

      const response = await server.app.request(`/api/items/${item.id}`, {
        headers: { host: LOCAL_HOST },
      });

      expect(response.status).toBe(200);
      expect(((await response.json()) as Json).state).toBe('sconcept');
    } finally {
      server.close();
      other.db.close();
      serving.db.close();
    }
  });
});
