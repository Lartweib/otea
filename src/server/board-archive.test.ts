import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, ensureRequestsBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { createItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { creatures } from '../core/board/testing.ts';
import { findBoard } from '../store/boards.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Archiving and deleting a board are the person's, from this computer's signed-in browser: like
// publishing, an agent (no session), a request a proxy forwarded and a paired phone are refused
// (desk-only.test.ts covers the phone for every Studio write).

type Call = {
  method?: string;
  body?: unknown;
  // '' sends none, as an agent calling the API would.
  cookie?: string;
  forwardedFor?: string;
};

describe('archiving and deleting boards over the API', () => {
  let project: Project;
  let server: OteaServer;
  let board: string;
  let item: string;

  const call = (path: string, options: Call = {}) => {
    const { method = 'GET', body, cookie = SESSION_COOKIE, forwardedFor } = options;
    const headers: Record<string, string> = { host: LOCAL_HOST };
    if (cookie !== '') headers.cookie = cookie;
    if (forwardedFor !== undefined) headers['x-forwarded-for'] = forwardedFor;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin = `http://${LOCAL_HOST}`;
    }
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    return Promise.resolve(
      server.app.request(path, init, { incoming: { socket: { remoteAddress: '127.0.0.1' } } }),
    );
  };
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string; details?: unknown } }).error;
  const names = async () => {
    const response = await call('/api/boards');
    return ((await response.json()) as { boards: { name: string }[] }).boards.map((b) => b.name);
  };

  beforeEach(() => {
    project = memoryProject();
    ensureRequestsBoard(project, 'es');
    board = createBoard(project, { name: 'Criaturas', lang: 'es' }).id;
    saveDraft(project, board, { definition: creatures(), baseVersion: null });
    publishBoard(project, board, { moves: {}, by: { kind: 'human', name: 'human' } });
    item = createItem(project, {
      collection: 'Criaturas',
      title: 'Ciervo',
      fields: { fdesc: 'x' },
      actor: { kind: 'agent', name: 'kiln' },
    }).id;
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('archives from the signed-in browser: gone from the lists, kept to read, frozen', async () => {
    const plan = await call(`/api/boards/${board}/archive/plan`);
    expect(await plan.json()).toMatchObject({ boards: [{ name: 'Criaturas', open: 1 }] });

    const archived = await call(`/api/boards/${board}/archive`, { method: 'POST', body: {} });

    expect(archived.status).toBe(200);
    expect(await names()).toEqual(['Pedidos']);
    const items = (await (await call('/api/items')).json()) as { id: string }[];
    expect(items.map(({ id }) => id)).not.toContain(item);
    const listed = await call('/api/boards/archived');
    expect(await listed.json()).toMatchObject({
      boards: [{ id: board, name: 'Criaturas', items: 1, entries: [{ id: item }] }],
    });
    const shown = await call(`/api/items/${item}`);
    expect(await shown.json()).toMatchObject({
      id: item,
      transitions: [],
      archived: { board: 'Criaturas', id: board, collection: { name: 'Criaturas' } },
    });

    const moved = await call(`/api/items/${item}/move`, { method: 'POST', body: { to: 'done' } });
    expect(moved.status).toBe(409);
    expect(await errorOf(moved)).toMatchObject({
      code: 'board_archived',
      details: { kind: 'board_archived', board: 'Criaturas', item },
    });

    const restored = await call(`/api/boards/${board}/unarchive`, { method: 'POST', body: {} });
    expect(restored.status).toBe(200);
    expect((await names()).sort()).toEqual(['Criaturas', 'Pedidos']);
  });

  it('refuses an agent without the session, and a request a proxy forwarded', async () => {
    const agent = await call(`/api/boards/${board}/archive`, {
      method: 'POST',
      body: {},
      cookie: '',
    });
    const forwarded = await call(`/api/boards/${board}/archive`, {
      method: 'POST',
      body: {},
      forwardedFor: '100.101.102.103',
    });
    const deleted = await call(`/api/boards/${board}`, {
      method: 'DELETE',
      body: { confirm: 'Criaturas' },
      cookie: '',
    });

    expect(agent.status).toBe(401);
    expect(forwarded.status).toBeGreaterThanOrEqual(400);
    expect(deleted.status).toBe(401);
    expect(findBoard(project.db, board)?.archivedAt).toBeNull();
    expect(await names()).toContain('Criaturas');
  });

  it('refuses Pedidos', async () => {
    const pedidos = ensureRequestsBoard(project, 'es');

    const archived = await call(`/api/boards/${pedidos}/archive`, { method: 'POST', body: {} });
    const deleted = await call(`/api/boards/${pedidos}`, { method: 'DELETE', body: {} });

    expect(archived.status).toBe(403);
    expect(await errorOf(archived)).toMatchObject({ details: { kind: 'board_builtin' } });
    expect(deleted.status).toBe(403);
  });

  it('deletes an archived board once its name is typed', async () => {
    const standing = await call(`/api/boards/${board}`, {
      method: 'DELETE',
      body: { confirm: 'Criaturas' },
    });
    expect(standing.status).toBe(409);
    expect(await errorOf(standing)).toMatchObject({ details: { kind: 'board_has_items' } });
    await call(`/api/boards/${board}/archive`, { method: 'POST', body: {} });
    const plan = await call(`/api/boards/${board}/delete/plan`);
    expect(await plan.json()).toMatchObject({ items: 1, confirm: true });

    const unconfirmed = await call(`/api/boards/${board}`, { method: 'DELETE', body: {} });
    expect(unconfirmed.status).toBe(400);
    expect(await errorOf(unconfirmed)).toMatchObject({
      details: { kind: 'board_delete_confirm', board: 'Criaturas', items: 1 },
    });
    const deleted = await call(`/api/boards/${board}`, {
      method: 'DELETE',
      body: { confirm: 'Criaturas' },
    });

    expect(deleted.status).toBe(200);
    expect(findBoard(project.db, board)).toBeUndefined();
    expect((await call(`/api/items/${item}`)).status).toBe(404);
  });
});
