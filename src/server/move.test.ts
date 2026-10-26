import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, getItem, moveItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const bot: Actor = { kind: 'agent', name: 'claude' };

const ORIGIN = `http://${LOCAL_HOST}`;

type Post = { body?: string; headers?: Record<string, string> };

describe('POST /api/items/:id/move', () => {
  let project: Project;
  let server: OteaServer;

  const post = (id: string, { body, headers }: Post = {}) =>
    Promise.resolve(
      server.app.request(`/api/items/${id}/move`, {
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
  const move = (id: string, payload: unknown, headers: Record<string, string> = {}) =>
    post(id, { body: JSON.stringify(payload), headers });
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    createItem(project, {
      collection: 'tasks',
      title: 'Ship',
      fields: { description: 'Now' },
      actor: bot,
    });
    moveItem(project, { id: 'TASKS-1', to: 'in_progress', actor: bot, channel: 'cli' });
    moveItem(project, { id: 'TASKS-1', to: 'review', actor: bot, channel: 'cli' });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('approves a human-ui transition as the human in the ui', async () => {
    const response = await move('TASKS-1', { to: 'done' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'TASKS-1', state: 'done', turn: 'none' });
    expect(getItem(project, 'TASKS-1').events.at(-1)).toMatchObject({
      type: 'transitioned',
      actor: { kind: 'human', name: 'human' },
      data: { from: 'review', to: 'done', channel: 'ui' },
    });
  });

  it('records the reason of a transition that requires one', async () => {
    const response = await move('TASKS-1', { to: 'todo', reason: 'Add tests' });

    expect(response.status).toBe(200);
    expect(getItem(project, 'TASKS-1').events.at(-1)?.data).toEqual({
      from: 'review',
      to: 'todo',
      reason: 'Add tests',
      channel: 'ui',
    });
  });

  it.each([{ to: 'todo' }, { to: 'todo', reason: '  ' }])(
    'rejects %j with 400 reason_required',
    async (payload) => {
      const response = await move('TASKS-1', payload);

      expect(response.status).toBe(400);
      expect(await errorOf(response)).toBe('reason_required');
    },
  );

  it('rejects a transition the workflow does not allow with 409', async () => {
    const response = await move('TASKS-1', { to: 'in_progress' });

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toBe('invalid_transition');
  });

  it('rejects leaving incomplete with missing fields with 422', async () => {
    createItem(project, { collection: 'tasks', title: 'Vague', actor: bot });

    const response = await move('TASKS-2', { to: 'todo' });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe('missing_fields');
  });

  it('returns 404 for an unknown item', async () => {
    const response = await move('TASKS-9', { to: 'done' });

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe('not_found');
  });

  describe('guards', () => {
    const unchanged = () => expect(getItem(project, 'TASKS-1').state).toBe('review');

    it.each([{}, { cookie: 'otea_session=wrong' }])(
      'rejects a request without a valid session with 401',
      async (headers) => {
        const response = await move('TASKS-1', { to: 'done' }, { cookie: '', ...headers });

        expect(response.status).toBe(401);
        expect(await errorOf(response)).toBe('unauthorized');
        unchanged();
      },
    );

    it('rejects every write when the server has no token', async () => {
      server.close();
      server = createServer(project);

      expect((await move('TASKS-1', { to: 'done' })).status).toBe(401);
      unchanged();
    });

    it.each(['http://evil.example', 'http://localhost:4400', 'null', ''])(
      'rejects origin %j with 403',
      async (origin) => {
        const response = await move('TASKS-1', { to: 'done' }, { origin });

        expect(response.status).toBe(403);
        expect(await errorOf(response)).toBe('forbidden_origin');
        unchanged();
      },
    );

    it('accepts the localhost origin when served as localhost', async () => {
      const response = await move(
        'TASKS-1',
        { to: 'done' },
        { host: 'localhost:4400', origin: 'http://localhost:4400' },
      );

      expect(response.status).toBe(200);
    });

    it.each(['text/plain', 'application/x-www-form-urlencoded', ''])(
      'rejects content type %j with 415',
      async (type) => {
        const response = await move('TASKS-1', { to: 'done' }, { 'content-type': type });

        expect(response.status).toBe(415);
        expect(await errorOf(response)).toBe('unsupported_media_type');
        unchanged();
      },
    );

    it.each(['{', '[]', '{"to":3}', '{"to":"done","reason":7}', '{}'])(
      'rejects body %s with 400',
      async (body) => {
        const response = await post('TASKS-1', { body });

        expect(response.status).toBe(400);
        expect(await errorOf(response)).toBe('invalid_body');
        unchanged();
      },
    );

    it('keeps the host guard', async () => {
      const response = await move('TASKS-1', { to: 'done' }, { host: 'evil.example:4400' });

      expect(response.status).toBe(403);
      unchanged();
    });
  });
});
