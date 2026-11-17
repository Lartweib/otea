import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { createItem, updateItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { creatures } from '../core/board/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// The person's order over the API: POST /api/order fixes a board's order from the matrix, POST
// /api/pin puts items on top; the list gives each item its place and the role values an agent
// estimated.

const kiln = { kind: 'agent' as const, name: 'kiln' };

function weighed(): BoardDefinition {
  const def = creatures();
  def.parts.feffort = {
    id: 'feffort',
    name: 'Esfuerzo',
    kind: 'choice',
    hint: '',
    options: [
      { id: 'cs', name: 'S' },
      { id: 'cl', name: 'L' },
    ],
  };
  def.parts.frisk = { id: 'frisk', name: 'Riesgo', kind: 'level', hint: '', options: [] };
  def.anytime = [...def.anytime, 'feffort', 'frisk'];
  def.analysis = { effort: 'feffort', risk: 'frisk' };
  return def;
}

describe('the person’s order over the API', () => {
  let project: Project;
  let server: OteaServer;

  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    Promise.resolve(
      server.app.request(
        `/api${path}`,
        {
          method: init.method ?? 'GET',
          headers: {
            host: LOCAL_HOST,
            origin: `http://${LOCAL_HOST}`,
            cookie: SESSION_COOKIE,
            'content-type': 'application/json',
          },
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        },
        { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
      ),
    );

  beforeEach(() => {
    project = memoryProject();
    const record = createBoard(project, { name: 'Criaturas', lang: 'es' });
    saveDraft(project, record.id, { definition: weighed(), baseVersion: null });
    publishBoard(project, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
    for (const title of ['Tortuga', 'Garza'])
      createItem(project, {
        collection: 'Criaturas',
        title,
        fields: { fdesc: 'Lenta' },
        actor: kiln,
        channel: 'cli',
      });
    updateItem(project, { id: 'CRI-1', fields: { frisk: 'high' }, actor: kiln });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('fixes the order and pins, and the list says where each item stands', async () => {
    expect(
      (
        await call('/order', {
          method: 'POST',
          body: { collection: 'Criaturas', ids: ['CRI-2', 'CRI-1'] },
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('/pin', { method: 'POST', body: { ids: ['CRI-1'], pinned: true } })).status,
    ).toBe(200);
    const rows = (await (await call('/items')).json()) as Record<string, unknown>[];
    expect(rows.find(({ id }) => id === 'CRI-1')).toMatchObject({
      priority: { pin: 1, rank: 2 },
      estimates: { frisk: 'kiln' },
    });
    expect(rows.find(({ id }) => id === 'CRI-2')).toMatchObject({ priority: { rank: 1 } });
    expect(rows.find(({ id }) => id === 'CRI-2')).not.toHaveProperty('estimates');
  });

  it('refuses an order for a collection the project does not have', async () => {
    const answer = await call('/order', {
      method: 'POST',
      body: { collection: 'Nada', ids: [] },
    });
    expect(answer.status).toBe(404);
  });

  it('refuses a malformed order', async () => {
    const answer = await call('/order', { method: 'POST', body: { ids: 'CRI-1' } });
    expect(answer.status).toBe(400);
  });
});
