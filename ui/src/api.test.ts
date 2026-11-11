import { afterEach, describe, expect, it, vi } from 'vitest';
import { reassignItem, restartItem, undoRelease } from './api.ts';

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
