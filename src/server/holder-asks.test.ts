import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import type { Project } from '../app/project.ts';
import { answerQuestion, askQuestion } from '../app/questions.ts';
import { publishAs } from '../app/testing.ts';
import { creatures } from '../core/board/testing.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// P7-R3-9: an agent held items while it waited for the person's answer on another one, and the
// desk said it was doing them. The lists and the item page say which item its question waits on.

const kiln: Actor = { kind: 'agent', name: 'kiln' };
const you: Actor = { kind: 'human', name: 'fede' };
const HEADERS = { host: LOCAL_HOST, origin: `http://${LOCAL_HOST}`, cookie: SESSION_COOKIE };

describe('an item whose holder waits for your answer on another one, on the desk', () => {
  let project: Project;
  let server: OteaServer;

  const get = async (path: string) =>
    (await server.app.request(`/p/memory-aaaaaa/api/${path}`, { headers: HEADERS })).json();
  const listed = async (id: string) =>
    ((await get('items')) as { id: string; holderAsks?: unknown }[]).find((it) => it.id === id);

  beforeEach(() => {
    project = memoryProject();
    publishAs(project, creatures(), 'bcri');
    for (const title of ['Tortuga', 'Rana']) {
      const fields = { fdesc: 'Lenta' };
      const item = createItem(project, { collection: 'Criaturas', title, fields, actor: you });
      claimItem(project, { id: item.id, actor: kiln });
    }
    askQuestion(project, { id: 'CRI-2', text: '¿Con musgo?', actor: kiln, channel: 'cli' });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('names the item the holder’s question waits on, in the list and on the item', async () => {
    expect((await listed('CRI-1'))?.holderAsks).toEqual({ by: 'kiln', item: 'CRI-2' });
    expect(((await get('items/CRI-1')) as { holderAsks?: unknown }).holderAsks).toEqual({
      by: 'kiln',
      item: 'CRI-2',
    });
    // The item asked about says the question itself.
    expect(await listed('CRI-2')).not.toHaveProperty('holderAsks');
  });

  it('says nothing once the person answered', async () => {
    answerQuestion(project, { id: 'CRI-2', text: 'Sí', actor: you, channel: 'ui' });

    expect(await listed('CRI-1')).not.toHaveProperty('holderAsks');
  });
});
