import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { pairDevice } from '../app/devices.ts';
import { createItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { addTopic, answerTopic, closeTopic, setTopicsOn } from '../app/topics.ts';
import { creatures } from '../core/board/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Side topics over the API: the page and the phone read them, keep one going with a note, close
// one or turn it into a task; the desk alone turns them on or off.

const DESK = '192.168.1.24';
const PHONE = '192.168.1.50';
const kiln = { kind: 'agent' as const, name: 'kiln' };

describe('topics over the API', () => {
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
        `/p/memory-aaaaaa/api${path}`,
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
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] } });
    phoneCookie = `otea_device_4400=${pairDevice(server.machine, 'Pixel · Chrome').token}`;
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('says topics are off, and turns them on from the desk only', async () => {
    expect(await (await call('/topics')).json()).toEqual({ on: false, topics: [] });

    const fromPhone = await call('/topics/switch', { method: 'POST', body: { on: true } }, 'phone');
    expect(fromPhone.status).toBe(403);

    const fromDesk = await call('/topics/switch', { method: 'POST', body: { on: true } });
    expect(fromDesk.status).toBe(200);
    expect(await fromDesk.json()).toEqual({ on: true, topics: [] });
  });

  it('lists the topics, and keeps one going with a note from the phone', async () => {
    setTopicsOn(project, true);
    addTopic(project, { question: '¿Por qué falla?', actor: kiln });
    answerTopic(project, { id: 'TEM-1', summary: 'Una variable.', full: 'Todo…', actor: kiln });

    const listed = (await (await call('/topics')).json()) as { topics: { id: string }[] };
    expect(listed.topics.map(({ id }) => id)).toEqual(['TEM-1']);

    const noted = await call(
      '/topics/TEM-1/notes',
      { method: 'POST', body: { text: '¿Y en Linux?' } },
      'phone',
    );
    expect(noted.status).toBe(201);
    expect(await noted.json()).toMatchObject({ id: 'TEM-1', state: 'open', turn: 'agent' });
  });

  it('searches every topic, closed ones too', async () => {
    setTopicsOn(project, true);
    addTopic(project, { question: '¿Qué licencia uso?', actor: kiln });
    answerTopic(project, { id: 'TEM-1', summary: 'MIT.', full: 'MIT, por simple.', actor: kiln });
    closeTopic(project, { id: 'TEM-1', actor: { kind: 'human', name: 'fede' } });
    addTopic(project, { question: 'Otra cosa', actor: kiln });

    const found = (await (await call('/topics?search=simple')).json()) as {
      topics: { id: string }[];
    };
    expect(found.topics.map(({ id }) => id)).toEqual(['TEM-1']);
  });

  it('closes a topic and turns another into a task linked both ways', async () => {
    setTopicsOn(project, true);
    addTopic(project, { question: 'uno', actor: kiln });
    addTopic(project, { question: 'dos', actor: kiln });
    createItem(project, {
      collection: 'Criaturas',
      title: 'Tortuga',
      fields: { fdesc: 'Lenta' },
      actor: { kind: 'human', name: 'human' },
      channel: 'cli',
    });

    expect(await (await call('/topics/TEM-1/close', { method: 'POST' })).json()).toMatchObject({
      state: 'closed',
    });
    const converted = await call('/topics/TEM-2/convert', {
      method: 'POST',
      body: { item: 'CRI-1' },
    });
    expect(await converted.json()).toMatchObject({ state: 'task', task: 'CRI-1' });

    const ofItem = (await (await call('/items/CRI-1/topics')).json()) as {
      linked: { id: string; pending: boolean }[];
      suggested: unknown[];
    };
    expect(ofItem.linked).toEqual([expect.objectContaining({ id: 'TEM-2', pending: false })]);
  });

  it('suggests a topic for an item and lets the person confirm or dismiss it', async () => {
    setTopicsOn(project, true);
    addTopic(project, { question: 'uno', actor: kiln });
    addTopic(project, { question: 'dos', actor: kiln });
    createItem(project, {
      collection: 'Criaturas',
      title: 'Tortuga',
      fields: { fdesc: 'Lenta' },
      actor: kiln,
      channel: 'cli',
    });

    const before = (await (await call('/items/CRI-1/topics')).json()) as {
      suggested: { id: string }[];
    };
    expect(before.suggested.map(({ id }) => id)).toEqual(['TEM-1', 'TEM-2']);

    await call('/items/CRI-1/topics/TEM-1/confirm', { method: 'POST' });
    await call('/items/CRI-1/topics/TEM-2/dismiss', { method: 'POST' });
    const after = (await (await call('/items/CRI-1/topics')).json()) as {
      linked: { id: string }[];
      suggested: unknown[];
    };
    expect(after.linked.map(({ id }) => id)).toEqual(['TEM-1']);
    expect(after.suggested).toEqual([]);
  });

  it('refuses an empty note', async () => {
    setTopicsOn(project, true);
    addTopic(project, { question: 'uno', actor: kiln });
    const refused = await call('/topics/TEM-1/notes', { method: 'POST', body: { text: '' } });
    expect(refused.status).toBe(400);
  });
});
