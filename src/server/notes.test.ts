import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { pairDevice } from '../app/devices.ts';
import { createItem, getItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import { replyNote } from '../app/notes.ts';
import type { Project } from '../app/project.ts';
import { creatures } from '../core/board/testing.ts';
import { insertEvidence, upsertAgent } from '../store/queries.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Notes from the person while an agent works, from the page and the phone:
// POST /api/items/:id/notes leaves one, GET /api/items/:id/notes reads the thread (a step and a
// round, or all), with the agent at work and its last sign of life; lists mark what the agent
// answered without the turn changing.

const DESK = '192.168.1.24';
const PHONE = '192.168.1.50';
const kiln = { kind: 'agent' as const, name: 'kiln' };

describe('notes from the person over the API', () => {
  let project: Project;
  let server: OteaServer;
  let phoneCookie: string;

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
    claimItem(project, { id: 'CRI-1', actor: kiln });
    upsertAgent(project.db, {
      name: 'kiln',
      harness: null,
      harnessVersion: null,
      lastSeen: '2026-11-13T12:50:00.000Z',
    });
    phoneCookie = `otea_device_4400=${pairDevice(project.db, 'Pixel · Chrome').token}`;
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] } });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('leaves a note as the person, from the phone too, and moves nothing', async () => {
    const before = getItem(project, 'CRI-1');

    const response = await call(
      '/items/CRI-1/notes',
      { method: 'POST', body: { text: '¿Y la cola?' } },
      'phone',
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      item: 'CRI-1',
      notes: [{ note: 1, text: '¿Y la cola?', by: 'human', stepName: 'Concepto', round: 1 }],
      worker: { name: 'kiln', lastSeen: '2026-11-13T12:50:00.000Z', holds: true },
    });
    const after = getItem(project, 'CRI-1');
    expect([after.state, after.lease]).toEqual([before.state, before.lease]);
    expect(after.events.at(-1)).toMatchObject({
      type: 'note_left',
      actor: { kind: 'human', name: 'human' },
      data: { channel: 'ui' },
    });
  });

  it('anchors a note to a piece of evidence, at a moment of a recording', async () => {
    const evidence = insertEvidence(project.db, {
      itemId: 'CRI-1',
      role: 'after',
      module: 'eart',
      kind: 'image',
      filename: 'pose.png',
      contentType: 'image/png',
      size: 1,
      sha256: 'a'.repeat(64),
      caption: null,
      createdAt: new Date().toISOString(),
      actor: kiln,
      channel: 'cli',
    });

    const response = await call('/items/CRI-1/notes', {
      method: 'POST',
      body: { text: 'La pata', anchor: { evidence, seconds: 2 } },
    });

    expect(response.status).toBe(201);
    expect(((await response.json()) as { notes: unknown[] }).notes[0]).toMatchObject({
      anchor: { evidence, filename: 'pose.png', partName: 'Arte conceptual', seconds: 2 },
    });
  });

  it('refuses a malformed note and an empty one', async () => {
    const malformed = await call('/items/CRI-1/notes', { method: 'POST', body: { text: 3 } });
    expect(malformed.status).toBe(400);
    const empty = await call('/items/CRI-1/notes', { method: 'POST', body: { text: '  ' } });
    expect(await empty.json()).toMatchObject({
      error: { details: { kind: 'note', item: 'CRI-1', why: 'empty' } },
    });
  });

  it('reads the thread of an item, of a step and round, and in the item and its list', async () => {
    await call('/items/CRI-1/notes', { method: 'POST', body: { text: 'uno' } });
    await call('/items/CRI-1/notes', { method: 'POST', body: { text: 'dos' } });
    replyNote(project, { id: 'CRI-1', note: 2, text: 'b', actor: kiln, channel: 'cli' });

    const thread = (await (await call('/items/CRI-1/notes')).json()) as { notes: unknown[] };
    expect(thread.notes).toHaveLength(2);
    const round = await call('/items/CRI-1/notes?step=Concepto&round=2');
    expect(((await round.json()) as { notes: unknown[] }).notes).toEqual([]);
    const bad = await call('/items/CRI-1/notes?round=no');
    expect(bad.status).toBe(400);

    const item = (await (await call('/items/CRI-1')).json()) as {
      board: { thread: unknown[]; worker: unknown };
    };
    expect(item.board.thread).toHaveLength(2);
    expect(item.board.worker).toMatchObject({ name: 'kiln' });

    const list = (await (await call('/items')).json()) as Array<{ turn: string; notes: unknown }>;
    expect(list[0]?.turn).toBe('agent');
    expect(list[0]?.notes).toMatchObject({
      count: 2,
      unanswered: 1,
      replied: { note: 2, by: 'kiln' },
    });
  });
});
