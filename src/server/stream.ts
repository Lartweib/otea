import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ChangeFeed } from './changes.ts';

export type LiveStreams = {
  handle(c: Context): Response;
  closeAll(): void;
};

export function liveStreams(feed: ChangeFeed): LiveStreams {
  const open = new Set<() => void>();
  return {
    handle: (c) =>
      streamSSE(c, async (stream) => {
        const { promise: ended, resolve } = Promise.withResolvers<void>();
        const unsubscribe = feed.subscribe(() => {
          void stream.writeSSE({ event: 'change', data: '' });
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
