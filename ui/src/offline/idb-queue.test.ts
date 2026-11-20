import { IDBFactory as FakeIndexedDb } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { flush, type QueuedCapture, type Sent } from './capture-queue.ts';
import { idbQueue } from './idb-queue.ts';
import { discard, enqueue } from './queue-store.ts';

// The phone's capture queue in IndexedDB: what holds a capture made while the PC does not answer,
// until a send the PC takes clears it. The page and the service worker each open the database anew
// for every read and write (idb-queue.ts), so each call here goes through a connection of its own.
// fake-indexeddb is an in-memory IndexedDB that follows the standard; each test gets a new one.

beforeEach(() => {
  globalThis.indexedDB = new FakeIndexedDb();
});

const capture = (id: string, at: number, extra: Partial<QueuedCapture> = {}): QueuedCapture => ({
  id,
  at,
  board: 'Pedidos',
  type: 'request',
  fields: { title: `Pedido ${id}`, description: 'Hecho sin conexión' },
  ...extra,
});

const photo = () => ({
  name: 'grieta.jpg',
  type: 'image/jpeg',
  bytes: new Uint8Array([255, 216, 255, 224, 0, 16]).buffer,
  role: 'screenshot',
});

describe('the capture queue in IndexedDB', () => {
  it('keeps a capture, its photo’s bytes included, for whatever opens the queue next', async () => {
    const made = capture('a1', 1, { photo: photo(), project: 'hm-k3x7qa' });
    await idbQueue.put(made);

    const [kept] = await idbQueue.all();
    expect(kept).toEqual(made);
    expect(new Uint8Array(kept?.photo?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([255, 216, 255, 224, 0, 16]),
    );
  });

  it('lists every capture kept, and holds one per id: a capture kept again replaces it', async () => {
    await idbQueue.put(capture('a1', 1));
    await idbQueue.put(capture('b2', 2));
    await idbQueue.put(capture('a1', 1, { refused: 'The board changed' }));

    const kept = await idbQueue.all();
    expect(kept.map(({ id, refused }) => [id, refused])).toEqual([
      ['a1', 'The board changed'],
      ['b2', undefined],
    ]);
  });

  it('takes one out by its id and leaves the rest', async () => {
    await idbQueue.put(capture('a1', 1));
    await idbQueue.put(capture('b2', 2));
    await idbQueue.remove('a1');

    expect((await idbQueue.all()).map(({ id }) => id)).toEqual(['b2']);
  });
});

describe('sending the queue', () => {
  const pc =
    (answers: Record<string, Sent>) =>
    async (c: QueuedCapture): Promise<Sent> =>
      answers[c.id] ?? { kind: 'unheard' };

  it('clears what the PC made, and keeps what it refused, with its words, for the person', async () => {
    await idbQueue.put(capture('a1', 1));
    await idbQueue.put(capture('b2', 2));

    await flush(
      idbQueue,
      pc({
        a1: { kind: 'made', item: 'PED-7' },
        b2: { kind: 'refused', message: 'No such board' },
      }),
    );

    const left = await idbQueue.all();
    expect(left.map(({ id, refused }) => [id, refused])).toEqual([['b2', 'No such board']]);
  });

  it('keeps everything while the PC does not answer', async () => {
    await idbQueue.put(capture('a1', 1));
    await idbQueue.put(capture('b2', 2));

    const out = await flush(idbQueue, pc({}));

    expect(out.unheard).toBe(true);
    expect((await idbQueue.all()).map(({ id }) => id)).toEqual(['a1', 'b2']);
  });
});

describe('the page’s side of the queue', () => {
  it('queues a capture into IndexedDB, and discarding one takes it out there', async () => {
    expect(await enqueue(capture('a1', 1))).toEqual({ ok: true });
    expect(await enqueue(capture('b2', 2))).toEqual({ ok: true });
    expect((await idbQueue.all()).map(({ id }) => id)).toEqual(['a1', 'b2']);

    await discard('a1');
    expect((await idbQueue.all()).map(({ id }) => id)).toEqual(['b2']);
  });
});
