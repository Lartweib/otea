import { afterEach, describe, expect, it, vi } from 'vitest';
import { discardDraft, fetchPublishPlan } from './api.ts';

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
});
