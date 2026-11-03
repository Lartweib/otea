import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ChangeFeed } from './changes.ts';

export type LiveStreams = {
  handle(c: Context): Response;
  closeAll(): void;
};

// Every change sends `change`. When `presence` is given, a change that also moved the agents'
// presence (a new agent, its harness, when it was last seen, what it holds) sends `presence` too,
// so a view of the agents alone can read them again without reloading the rest.
export function liveStreams(feed: ChangeFeed, presence?: () => string): LiveStreams {
  const open = new Set<() => void>();
  return {
    handle: (c) =>
      streamSSE(c, async (stream) => {
        const { promise: ended, resolve } = Promise.withResolvers<void>();
        let seen = presence?.();
        const unsubscribe = feed.subscribe(() => {
          void stream.writeSSE({ event: 'change', data: '' });
          if (!presence) return;
          const now = presence();
          if (now === seen) return;
          seen = now;
          void stream.writeSSE({ event: 'presence', data: '' });
        });
        const end = () => {
          unsubscribe();
          open.delete(end);
          resolve();
        };
        open.add(end);
        stream.onAbort(end);
        await stream.writeSSE({ event: 'ready', data: '' });
        await ended;
      }),
    closeAll() {
      for (const end of open) end();
    },
  };
}
