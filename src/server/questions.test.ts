import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { pairDevice } from '../app/devices.ts';
import { createItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import type { Project } from '../app/project.ts';
import { askQuestion } from '../app/questions.ts';
import { creatures } from '../core/board/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// An agent's question to the person over the API: the list and the item give it with the turn the
// person's, and POST /api/items/:id/answer, from the page or the phone, hands it back to the agent.

const DESK = '192.168.1.24';
const PHONE = '192.168.1.50';
const kiln = { kind: 'agent' as const, name: 'kiln' };

describe('an agent’s question over the API', () => {
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
    askQuestion(project, { id: 'CRI-1', text: '¿Con musgo?', actor: kiln, channel: 'cli' });
    phoneCookie = `otea_device_4400=${pairDevice(project.db, 'Pixel · Chrome').token}`;
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] } });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('gives the question on the list and the item, on the person’s turn', async () => {
    const [row] = (await (await call('/items')).json()) as Record<string, unknown>[];
    expect(row).toMatchObject({
      turn: 'human',
      asks: { question: 1, by: 'kiln', text: '¿Con musgo?' },
    });
    const item = (await (await call('/items/CRI-1')).json()) as {
      turn: string;
      board: { asking: unknown; questions: unknown[] };
    };
    expect(item.turn).toBe('human');
    expect(item.board.asking).toMatchObject({ question: 1, text: '¿Con musgo?' });
    expect(item.board.questions).toHaveLength(1);
  });

  it('answers as the person, from the phone too, and the turn goes back to the agent', async () => {
    const response = await call(
      '/items/CRI-1/answer',
      { method: 'POST', body: { text: 'Sí, mucho' } },
      'phone',
    );
    expect(response.status).toBe(200);
    const item = (await response.json()) as {
      turn: string;
      asks?: unknown;
      board: { questions: { answer?: { text: string; by: string } }[] };
    };
    expect(item.turn).toBe('agent');
    expect(item.asks).toBeUndefined();
    expect(item.board.questions[0]?.answer).toMatchObject({ text: 'Sí, mucho' });
  });

  it('refuses a malformed answer, an empty one, and one with no question waiting', async () => {
    const malformed = await call('/items/CRI-1/answer', { method: 'POST', body: { text: 3 } });
    expect(malformed.status).toBe(400);
    const empty = await call('/items/CRI-1/answer', { method: 'POST', body: { text: ' ' } });
    expect(await empty.json()).toMatchObject({
      error: { details: { kind: 'question', item: 'CRI-1', why: 'empty' } },
    });
    await call('/items/CRI-1/answer', { method: 'POST', body: { text: 'Sí' } });
    const again = await call('/items/CRI-1/answer', { method: 'POST', body: { text: 'Sí' } });
    expect(await again.json()).toMatchObject({
      error: { details: { kind: 'question', why: 'none_open' } },
    });
  });
});
