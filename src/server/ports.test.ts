import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { type Listening, listen } from './listen.ts';
import { createServer } from './server.ts';
import { memoryProject, TOKEN } from './testing.ts';

const OTHER_TOKEN = 'other-token-0123456789abcdefghijklmnopqrstu';

type Running = { project: Project; listening: Listening; token: string };

async function start(token: string): Promise<Running> {
  const project = memoryProject();
  addCollection(project, { name: 'tasks' });
  const actor = { kind: 'agent', name: 'claude' } as const;
  createItem(project, { collection: 'tasks', title: 'Ship', fields: { description: 'x' }, actor });
  moveItem(project, { id: 'TASKS-1', to: 'in_progress', actor, channel: 'cli' });
  moveItem(project, { id: 'TASKS-1', to: 'review', actor, channel: 'cli' });
  return { project, listening: await listen(createServer(project, { token }), 0), token };
}

async function signIn({ listening, token }: Running): Promise<string> {
  const response = await fetch(`${listening.url}/auth?token=${token}`, { redirect: 'manual' });
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const canWrite = async ({ listening }: Running, cookie: string) =>
  (
    (await (await fetch(`${listening.url}/api/session`, { headers: { cookie } })).json()) as {
      canWrite: boolean;
    }
  ).canWrite;

const approve = ({ listening }: Running, cookie: string) =>
  fetch(`${listening.url}/api/items/TASKS-1/move`, {
    method: 'POST',
    headers: { cookie, origin: listening.url, 'content-type': 'application/json' },
    body: JSON.stringify({ to: 'done' }),
  });

describe('sessions on several ports', () => {
  let a: Running;
  let b: Running;

  beforeEach(async () => {
    a = await start(TOKEN);
    b = await start(OTHER_TOKEN);
  });

  afterEach(async () => {
    for (const { listening, project } of [a, b]) {
      await listening.close();
      project.db.close();
    }
  });

  it('names the session cookie after the bound port', async () => {
    expect(await signIn(a)).toBe(`otea_session_${a.listening.port}=${TOKEN}`);
  });

  it('keeps one browser signed in to two servers at once', async () => {
    const jar = [await signIn(a), await signIn(b)].join('; ');

    expect(await canWrite(a, jar)).toBe(true);
    expect(await canWrite(b, jar)).toBe(true);
  });

  it('ignores a cookie for another port', async () => {
    const forA = await signIn(a);
    const replayed = forA.replace(`_${a.listening.port}=`, `_${b.listening.port}=`);

    expect(await canWrite(b, forA)).toBe(false);
    expect((await approve(b, forA)).status).toBe(401);
    expect(await canWrite(b, replayed)).toBe(false);
    expect((await approve(b, replayed)).status).toBe(401);
  });

  it('ignores the legacy unscoped cookie', async () => {
    expect(await canWrite(a, `otea_session=${TOKEN}`)).toBe(false);
  });
});
