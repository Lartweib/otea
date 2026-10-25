import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem } from '../app/items.ts';
import { migrate } from '../store/migrations.ts';
import { createServer, type OteaServer } from './server.ts';
import { tempDatabase } from './testing.ts';

type Reader = ReadableStreamDefaultReader<Uint8Array>;

async function readUntil(reader: Reader, text: string): Promise<string> {
  const decoder = new TextDecoder();
  let received = '';
  while (!received.includes(text)) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`Stream ended before "${text}"; got ${JSON.stringify(received)}`);
    received += decoder.decode(value, { stream: true });
  }
  return received;
}

describe('GET /api/stream', () => {
  let temp: ReturnType<typeof tempDatabase>;
  let db: DatabaseSync;
  let other: DatabaseSync;
  let server: OteaServer;

  const connect = async () => {
    const response = await server.app.request('/api/stream');
    const reader = response.body?.getReader() as Reader;
    await readUntil(reader, 'event: ready');
    return { response, reader };
  };

  beforeEach(() => {
    temp = tempDatabase();
    db = temp.open();
    migrate(db);
    addCollection(db, { name: 'tasks' });
    other = temp.open();
    server = createServer({ root: '/tmp', db }, { pollIntervalMs: 10 });
  });

  afterEach(() => {
    server.close();
    vi.useRealTimers();
    db.close();
    other.close();
    temp.remove();
  });

  it('is an event stream', async () => {
    const { response, reader } = await connect();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await reader.cancel();
  });

  it('emits change after another connection writes', async () => {
    const { reader } = await connect();

    createItem(other, {
      collection: 'tasks',
      title: 'From elsewhere',
      actor: { kind: 'agent', name: 'a' },
    });

    expect(await readUntil(reader, 'event: change')).toContain('event: change');
    await reader.cancel();
  });

  it('stops polling when the client disconnects', async () => {
    vi.useFakeTimers();
    const { reader } = await connect();
    expect(vi.getTimerCount()).toBe(1);

    await reader.cancel();

    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(0));
  });

  it('ends open streams when the server stops', async () => {
    vi.useFakeTimers();
    const { reader } = await connect();

    server.close();

    expect(await reader.read()).toMatchObject({ done: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
