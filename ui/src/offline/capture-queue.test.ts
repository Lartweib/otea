import { describe, expect, it } from 'vitest';
import {
  captureId,
  captureRequest,
  fits,
  flush,
  QUEUE_MAX_BYTES,
  type QueuedCapture,
  type QueueStore,
  type Sent,
  sendWith,
  serialFlush,
} from './capture-queue.ts';

function memoryStore(initial: QueuedCapture[] = []) {
  const map = new Map(initial.map((c) => [c.id, c]));
  const store: QueueStore = {
    all: async () => [...map.values()],
    put: async (c) => {
      map.set(c.id, c);
    },
    remove: async (id) => {
      map.delete(id);
    },
  };
  return { store, map };
}

const capture = (id: string, at: number, extra: Partial<QueuedCapture> = {}): QueuedCapture => ({
  id,
  at,
  board: 'Pedidos',
  type: 'request',
  fields: { title: `Item ${id}` },
  ...extra,
});

// A PC that makes each item once per key, as the server does, and can be switched off.
function fakePc() {
  const made = new Map<string, string>();
  let on = true;
  let n = 0;
  const send = async (c: QueuedCapture): Promise<Sent> => {
    if (!on) return { kind: 'unheard' };
    let item = made.get(c.id);
    if (!item) {
      n += 1;
      item = `PED-${n}`;
      made.set(c.id, item);
    }
    return { kind: 'made', item };
  };
  return {
    send,
    made,
    off: () => {
      on = false;
    },
    on: () => {
      on = true;
    },
  };
}

describe('flush', () => {
  it('sends what waits, oldest first, and keeps nothing it sent', async () => {
    const { store, map } = memoryStore([capture('b', 2), capture('a', 1)]);
    const pc = fakePc();

    const out = await flush(store, pc.send);

    expect(out.made.map((m) => [m.capture.id, m.item])).toEqual([
      ['a', 'PED-1'],
      ['b', 'PED-2'],
    ]);
    expect(map.size).toBe(0);
  });

  it('keeps everything while the PC does not answer, and sends it when it does', async () => {
    const { store, map } = memoryStore([capture('a', 1), capture('b', 2)]);
    const pc = fakePc();
    pc.off();

    const offline = await flush(store, pc.send);
    expect(offline).toMatchObject({ made: [], unheard: true });
    expect(map.size).toBe(2);

    pc.on();
    const back = await flush(store, pc.send);
    expect(back.made).toHaveLength(2);
    expect(map.size).toBe(0);
  });

  it('never makes two items when a send reached the PC but its answer was lost', async () => {
    const { store, map } = memoryStore([capture('a', 1)]);
    const pc = fakePc();
    let lose = true;
    const lossy = async (c: QueuedCapture): Promise<Sent> => {
      const sent = await pc.send(c);
      if (lose) {
        lose = false;
        return { kind: 'unheard' };
      }
      return sent;
    };

    await flush(store, lossy);
    expect(map.has('a')).toBe(true);
    const again = await flush(store, lossy);

    expect(again.made.map((m) => m.item)).toEqual(['PED-1']);
    expect(pc.made.size).toBe(1);
  });

  it('keeps a capture the PC refused, with its words, and sends the rest', async () => {
    const { store, map } = memoryStore([capture('a', 1), capture('b', 2)]);
    const send = async (c: QueuedCapture): Promise<Sent> =>
      c.id === 'a'
        ? { kind: 'refused', message: 'Board "Pedidos" not found' }
        : { kind: 'made', item: 'X-1' };

    const out = await flush(store, send);

    expect(out.refused.map((c) => c.id)).toEqual(['a']);
    expect(map.get('a')?.refused).toBe('Board "Pedidos" not found');
    expect(map.has('b')).toBe(false);
    // Refused ones are not sent again on their own.
    expect((await flush(store, send)).refused).toEqual([]);
  });

  it('counts a sender that throws as not heard', async () => {
    const { store, map } = memoryStore([capture('a', 1)]);
    const out = await flush(store, async () => {
      throw new Error('boom');
    });

    expect(out.unheard).toBe(true);
    expect(map.size).toBe(1);
  });

  it('runs one flush at a time', async () => {
    let calls = 0;
    const once = serialFlush(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 1));
      return { made: [], refused: [], unheard: false };
    });

    await Promise.all([once(), once()]);
    await once();

    expect(calls).toBe(2);
  });
});

describe('fits', () => {
  const photo = (bytes: number) => ({
    name: 'p.jpg',
    type: 'image/jpeg',
    bytes: new ArrayBuffer(bytes),
    role: 'single',
  });

  it('takes captures until the queue holds its most, photos included', () => {
    const half = capture('a', 1, { photo: photo(QUEUE_MAX_BYTES / 2) });

    expect(fits([], half)).toBe(true);
    expect(fits([half], capture('b', 2, { photo: photo(QUEUE_MAX_BYTES / 2) }))).toBe(false);
  });
});

describe('sendWith', () => {
  const answer = (status: number, body: unknown) => async () => Response.json(body, { status });

  it('sends the capture with its id as the Idempotency-Key and reads the item made', async () => {
    let seen: RequestInit | undefined;
    const send = sendWith(async (_url, init) => {
      seen = init;
      return Response.json({ id: 'PED-4' }, { status: 201 });
    });

    expect(await send(capture('cap-1', 1))).toEqual({ kind: 'made', item: 'PED-4' });
    expect((seen?.headers as Record<string, string> | undefined)?.['idempotency-key']).toBe(
      'cap-1',
    );
  });

  it('reads a resend the PC already made as made', async () => {
    const send = sendWith(answer(200, { id: 'PED-4' }));
    expect(await send(capture('a', 1))).toEqual({ kind: 'made', item: 'PED-4' });
  });

  it.each([401, 502, 503, 504])('counts a %s as not heard', async (status) => {
    expect(await sendWith(answer(status, {}))(capture('a', 1))).toEqual({ kind: 'unheard' });
  });

  it('counts no answer as not heard', async () => {
    const send = sendWith(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await send(capture('a', 1))).toEqual({ kind: 'unheard' });
  });

  it('keeps the words of a refusal', async () => {
    const send = sendWith(
      answer(422, { error: { code: 'invalid_fields', message: 'Needs a title' } }),
    );
    expect(await send(capture('a', 1))).toEqual({ kind: 'refused', message: 'Needs a title' });
  });
});

describe('captureRequest', () => {
  it('sends a photo as evidence in a form, as the sheet does', async () => {
    const { init } = captureRequest(
      capture('a', 1, {
        photo: { name: 'p.jpg', type: 'image/jpeg', bytes: new ArrayBuffer(3), role: 'single' },
      }),
    );
    const form = init.body as FormData;

    expect(JSON.parse(String(form.get('item')))).toMatchObject({
      collection: 'Pedidos',
      evidence: [{ role: 'single' }],
    });
    expect((form.get('file') as File).name).toBe('p.jpg');
  });
});

describe('captureId', () => {
  it('is random hex, without randomUUID (plain HTTP has none)', () => {
    const id = captureId((b) => b.fill(171));
    expect(id).toBe(`cap-${'ab'.repeat(16)}`);
    expect(captureId()).not.toBe(captureId());
  });
});
