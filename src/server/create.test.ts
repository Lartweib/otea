import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { getItem, listItems } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const ORIGIN = `http://${LOCAL_HOST}`;

type Post = { body?: string; headers?: Record<string, string> };

describe('POST /api/items', () => {
  let project: Project;
  let server: OteaServer;

  const post = ({ body, headers }: Post = {}) =>
    Promise.resolve(
      server.app.request('/api/items', {
        method: 'POST',
        body: body ?? '',
        headers: {
          host: LOCAL_HOST,
          origin: ORIGIN,
          cookie: SESSION_COOKIE,
          'content-type': 'application/json',
          ...headers,
        },
      }),
    );
  const create = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
    post({ body: JSON.stringify({ collection: 'tasks', fields }), headers });
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;
  const nothingWritten = () => expect(listItems(project)).toEqual([]);

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('creates a complete item in the initial state with 201', async () => {
    const response = await create({ title: 'Ship', description: 'Now', priority: 'high' });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'TASKS-1', state: 'todo', turn: 'agent' });
    expect(getItem(project, 'TASKS-1')).toMatchObject({
      title: 'Ship',
      fields: { description: 'Now', priority: 'high' },
    });
  });

  it('starts an item without the fields required to complete it in incomplete', async () => {
    const response = await create({ title: 'Vague', description: '  ' });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'TASKS-1', state: 'incomplete' });
  });

  it('records the human in the ui as the creator', async () => {
    await create({ title: 'Ship' });

    const item = getItem(project, 'TASKS-1');
    expect(item.createdBy).toEqual({ kind: 'human', name: 'human' });
    expect(item.events).toMatchObject([
      {
        type: 'created',
        actor: { kind: 'human', name: 'human' },
        data: { state: 'incomplete', channel: 'ui' },
      },
    ]);
  });

  it.each([
    ['a missing title', { description: 'D' }],
    ['a blank title', { title: '   ' }],
    ['a value outside the enum', { title: 'X', priority: 'urgent' }],
    ['an unknown field', { title: 'X', owner: 'ana' }],
  ])('rejects %s with 422 invalid_fields', async (_, fields) => {
    const response = await create(fields);

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe('invalid_fields');
    nothingWritten();
  });

  it('returns 404 for an unknown collection', async () => {
    const response = await post({
      body: JSON.stringify({ collection: 'nope', fields: { title: 'X' } }),
    });

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe('not_found');
  });

  describe('guards', () => {
    it('rejects a request without a valid session with 401', async () => {
      const response = await create({ title: 'X' }, { cookie: '' });

      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe('unauthorized');
      nothingWritten();
    });

    it('rejects a foreign origin with 403', async () => {
      const response = await create({ title: 'X' }, { origin: 'http://evil.example' });

      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe('forbidden_origin');
      nothingWritten();
    });

    it('rejects a body that is not json with 415', async () => {
      const response = await create({ title: 'X' }, { 'content-type': 'text/plain' });

      expect(response.status).toBe(415);
      expect(await errorOf(response)).toBe('unsupported_media_type');
      nothingWritten();
    });

    it.each([
      '{',
      '[]',
      '{"fields":{"title":"X"}}',
      '{"collection":"tasks"}',
      '{"collection":"tasks","fields":{"title":3}}',
      '{"collection":"tasks","fields":[]}',
    ])('rejects body %s with 400', async (body) => {
      const response = await post({ body });

      expect(response.status).toBe(400);
      expect(await errorOf(response)).toBe('invalid_body');
      nothingWritten();
    });
  });
});
