// The main process's own view of the items: /api/items and /api/collections, read again on every
// change the live stream announces. It keeps working while the window is closed to the tray.
import type { DeskItem } from './state.ts';

export type Snapshot = { items: DeskItem[]; collections: string[] };

export type Watch = { close(): void };

export type WatchEvents = {
  onSnapshot(snapshot: Snapshot): void;
  onConnection(connected: boolean): void;
};

const MAX_BACKOFF_MS = 10_000;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return (await response.json()) as T;
}

export async function readSnapshot(base: string, signal: AbortSignal): Promise<Snapshot> {
  const [items, collections] = await Promise.all([
    getJson<DeskItem[]>(`${base}/api/items`, signal),
    getJson<{ name: string }[]>(`${base}/api/collections`, signal),
  ]);
  return { items, collections: collections.map((each) => each.name) };
}

// The names of the server-sent events in a chunk of the stream, and what is left unfinished.
export function sseEvents(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.replaceAll('\r\n', '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block) => {
    const line = block.split('\n').find((each) => each.startsWith('event:'));
    return line ? [line.slice('event:'.length).trim()] : [];
  });
  return { events, rest };
}

export function watchItems(base: string, events: WatchEvents): Watch {
  const stop = new AbortController();
  let reading = false;
  let again = false;

  // One read at a time; changes that arrive meanwhile collapse into one more read.
  const refresh = async () => {
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    try {
      do {
        again = false;
        events.onSnapshot(await readSnapshot(base, stop.signal));
      } while (again && !stop.signal.aborted);
    } finally {
      reading = false;
    }
  };

  const follow = async () => {
    const response = await fetch(`${base}/api/stream`, {
      signal: stop.signal,
      headers: { accept: 'text/event-stream' },
    });
    if (!response.ok || !response.body)
      throw new Error(`The live stream answered ${response.status}`);
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      const parsed = sseEvents(buffer + decoder.decode(chunk, { stream: true }));
      buffer = parsed.rest;
      for (const name of parsed.events) {
        if (name === 'ready') {
          events.onConnection(true);
          await refresh();
        } else if (name === 'change') void refresh().catch(() => {});
      }
    }
  };

  void (async () => {
    let backoff = 500;
    while (!stop.signal.aborted) {
      try {
        await follow();
        backoff = 500;
      } catch {
        // the server went away or is restarting: try again, slower each time
      }
      if (stop.signal.aborted) break;
      events.onConnection(false);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  })();

  return { close: () => stop.abort() };
}
