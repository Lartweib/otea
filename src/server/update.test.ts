import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem, getItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { cambios, tareasDeRepo } from '../core/board/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const ORIGIN = `http://${LOCAL_HOST}`;

describe('POST /api/items/:id/update', () => {
  let project: Project;
  let server: OteaServer;
  let id: string;

  const post = (path: string, payload: unknown) =>
    Promise.resolve(
      server.app.request(path, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          host: LOCAL_HOST,
          origin: ORIGIN,
          cookie: SESSION_COOKIE,
          'content-type': 'application/json',
        },
      }),
    );

  beforeEach(() => {
    project = memoryProject();
    publishAs(project, tareasDeRepo(), 'brt');
    publishAs(project, cambios(), 'bcam');
    const parent = createItem(project, {
      collection: 'Cambios',
      title: 'Nube',
      fields: { fwhat: 'x' },
      actor: you,
    });
    id = createItem(project, {
      collection: 'Tareas de repo',
      title: 'API',
      fields: { frepo: 'api', fbranch: 'feat/x' },
      parent: parent.id,
      actor: you,
    }).id;
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('says what the person’s own step still lacks, then fills it as the person', async () => {
    const before = (await (
      await server.app.request(`/api/items/${id}`, {
        headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE },
      })
    ).json()) as { board: { missing: { ref: string; name: string }[] } };
    expect(before.board.missing).toEqual([
      expect.objectContaining({ ref: 'fwhat', name: 'Qué propone' }),
    ]);

    const response = await post(`/api/items/${id}/update`, { fields: { fwhat: 'dos rutas' } });
    expect(response.status).toBe(200);
    expect(getItem(project, id).fields.fwhat).toBe('dos rutas');
  });

  it('refuses a body without fields', async () => {
    const response = await post(`/api/items/${id}/update`, { fields: 'x' });
    expect(response.status).toBe(400);
  });
});
