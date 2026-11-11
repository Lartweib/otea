import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../app/project.ts';
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

  it('keeps the routes the slices fill, answering that they are not there yet', async () => {
    const { id } = (await call('POST', '/boards', { name: 'X', lang: 'es' })).body as {
      id: string;
    };
    for (const [method, path] of [
      ['POST', `/boards/agent-draft`],
      ['POST', `/boards/${id}/draft/merge`],
    ] as const) {
      const { status, body } = await call(method, path, method === 'POST' ? {} : undefined);
      expect(status).toBe(501);
      expect((body.error as Json).code).toBe('not_implemented');
    }
  });
});
