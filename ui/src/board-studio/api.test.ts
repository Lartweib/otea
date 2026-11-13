import { afterEach, describe, expect, it, vi } from 'vitest';
import { discardDraft, fetchPublishPlan, publishBoard } from './api.ts';

afterEach(() => vi.unstubAllGlobals());

describe('the board Studio client', () => {
  it('sends every write as JSON, even one with nothing to say, so the server takes it', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ deleted: false }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    await discardDraft('b1');
    await fetchPublishPlan('b1');
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
      expect(init.body).toBe('{}');
    }
  });

  it('asks the publish to close the Pedido only when the person says so', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await publishBoard('b1', {}, null, true);
    await publishBoard('b1', {}, null);
    const bodies = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([, init]) =>
      JSON.parse(String(init.body)),
    );
    expect(bodies).toEqual([
      { moves: {}, draftStamp: null, closeRequest: true },
      { moves: {}, draftStamp: null },
    ]);
  });
});
