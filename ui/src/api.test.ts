import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchItem,
  freshPairingCode,
  reassignItem,
  restartItem,
  resumeItem,
  undoRelease,
} from './api.ts';

// Retomar, Reasignar and their Deshacer, as the UI asks the server.

const calls: { path: string; body: unknown }[] = [];
const ok = { id: 'ERR-7' };

function stubFetch() {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      calls.push({ path, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(ok), { status: 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('a stuck item, from the UI', () => {
  it('puts it back in the queue of its step', async () => {
    stubFetch();
    await restartItem('ERR-7');
    expect(calls).toEqual([{ path: '/api/items/ERR-7/restart', body: {} }]);
  });

  it('leaves it for the agent picked', async () => {
    stubFetch();
    await reassignItem('ERR-7', 'quill');
    expect(calls).toEqual([{ path: '/api/items/ERR-7/reassign', body: { agent: 'quill' } }]);
  });

  it('takes either back through the undo route', async () => {
    stubFetch();
    await undoRelease('ERR-7');
    expect(calls).toEqual([{ path: '/api/items/ERR-7/undo', body: { release: true } }]);
  });
});

// P7-R3-1: an item an agent set aside for later, taken up again by the person (Retomar).
describe('an item set aside for later, from the UI', () => {
  it('takes it up again through the resume route', async () => {
    stubFetch();
    await resumeItem('ERR-7');
    expect(calls).toEqual([{ path: '/api/items/ERR-7/resume', body: {} }]);
  });
});

// P7-R3-5: the pairing dialog opens on a fresh code, pointed at the network picked.
describe('the pairing dialog, from the UI', () => {
  it('asks for a fresh code when it opens', async () => {
    stubFetch();
    await freshPairingCode();
    await freshPairingCode('192.168.1.24');
    expect(calls).toEqual([
      { path: '/api/lan/code/fresh', body: {} },
      { path: '/api/lan/code/fresh?address=192.168.1.24', body: {} },
    ]);
  });
});

describe('an item opened by its link', () => {
  it('asks for null rather than a 404, and reads null as no such item', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        asked.push(path);
        return new Response('null', { status: 200 });
      }),
    );
    expect(await fetchItem('NOPE-99', new AbortController().signal)).toBeNull();
    expect(asked).toEqual(['/api/items/NOPE-99?missing=null']);
  });
});
