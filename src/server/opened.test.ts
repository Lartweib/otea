import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { pairDevice } from '../app/devices.ts';
import { createItem, getItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { creatures } from '../core/board/testing.ts';
import { insertEvidence } from '../store/queries.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// The files the person opened in the reader: POST /api/items/:id/opened records one, from the desk
// or the phone, and GET /api/items/:id/opened reads them back on any device.

const DESK = '192.168.1.24';
const PHONE = '192.168.1.50';
const kiln = { kind: 'agent' as const, name: 'kiln' };

describe('the files opened in the reader, over the API', () => {
  let project: Project;
  let server: OteaServer;
  let phoneCookie: string;
  let shot: number;

  const call = (
    path: string,
    init: { method?: string; body?: unknown } = {},
    from: 'desk' | 'phone' = 'desk',
  ) => {
    const host = from === 'desk' ? LOCAL_HOST : `${DESK}:4400`;
    const headers = {
      host,
      origin: `http://${host}`,
      cookie: from === 'desk' ? SESSION_COOKIE : phoneCookie,
      'content-type': 'application/json',
    };
    return Promise.resolve(
      server.app.request(
        `/api${path}`,
        {
          method: init.method ?? 'GET',
          headers,
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        },
        { incoming: { socket: { remoteAddress: from === 'desk' ? '127.0.0.1' : PHONE } } },
      ),
    );
  };

  beforeEach(() => {
    project = memoryProject();
    const record = createBoard(project, { name: 'Criaturas', lang: 'es' });
    saveDraft(project, record.id, { definition: creatures(), baseVersion: null });
    publishBoard(project, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
    createItem(project, {
      collection: 'Criaturas',
      title: 'Tortuga',
      fields: { fdesc: 'Lenta' },
      actor: kiln,
      channel: 'cli',
    });
    shot = insertEvidence(project.db, {
      itemId: 'CRI-1',
      role: 'single',
      module: 'eart',
      kind: 'image',
      filename: 'pose.png',
      contentType: 'image/png',
      size: 1,
      sha256: 'a'.repeat(64),
      caption: null,
      createdAt: '2026-11-17T09:00:00.000Z',
      actor: kiln,
      channel: 'cli',
    });
    phoneCookie = `otea_device_4400=${pairDevice(project.db, 'Pixel · Chrome').token}`;
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] } });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('counts a file opened on the phone on the desk, and adds nothing to the history', async () => {
    const events = getItem(project, 'CRI-1').events.length;
    const opened = await call(
      '/items/CRI-1/opened',
      { method: 'POST', body: { evidence: shot } },
      'phone',
    );
    expect(opened.status).toBe(200);
    expect(await opened.json()).toEqual({ evidence: [shot] });

    const read = await call('/items/CRI-1/opened');
    expect(await read.json()).toEqual({ evidence: [shot] });
    expect(getItem(project, 'CRI-1').events).toHaveLength(events);
  });

  it('refuses a file the item does not have', async () => {
    const response = await call('/items/CRI-1/opened', {
      method: 'POST',
      body: { evidence: shot + 1 },
    });
    expect(response.status).toBe(404);
  });
});
