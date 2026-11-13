// The captures made while the PC did not answer (the installed app over HTTPS): kept on the phone,
// photo included, and sent, in the order they were made, once the PC answers again. Each one keeps
// the id it was given when it was made and sends it as its Idempotency-Key, so a send that reached
// the PC but never came back cannot make a second item when it is sent again.
//
// Pure over a store and a sender: IndexedDB and fetch in the page and the service worker
// (idb-queue.ts, sendCapture), maps and fakes in the tests. Nothing in here is ever dropped but by
// a send the PC took, or by the person (Descartar, on one the PC refused).

export type QueuedPhoto = { name: string; type: string; bytes: ArrayBuffer; role: string };

export type QueuedCapture = {
  // Made on the phone; the Idempotency-Key of every send.
  id: string;
  // When it was captured (ms since the epoch): the queue sends the oldest first.
  at: number;
  board: string;
  type: string;
  fields: Record<string, string>;
  photo?: QueuedPhoto;
  // The PC took the send but refused the item (a board that changed meanwhile): why, in its words.
  // It stays until the person discards it.
  refused?: string;
};

export type QueueStore = {
  all(): Promise<QueuedCapture[]>;
  put(capture: QueuedCapture): Promise<void>;
  remove(id: string): Promise<void>;
};

// What one send came to: made (or made before: the same id), refused for good, or not heard.
export type Sent =
  | { kind: 'made'; item: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unheard' };

export type Sender = (capture: QueuedCapture) => Promise<Sent>;

// How much the queue keeps at most, photos included: past it a capture is not queued, and the
// sheet says so instead of losing it silently.
export const QUEUE_MAX_MB = 100;
export const QUEUE_MAX_BYTES = QUEUE_MAX_MB * 1024 * 1024;

export function sizeOf(capture: QueuedCapture): number {
  return (capture.photo?.bytes.byteLength ?? 0) + JSON.stringify(capture.fields).length;
}

export function fits(queued: readonly QueuedCapture[], next: QueuedCapture): boolean {
  const used = queued.reduce((sum, capture) => sum + sizeOf(capture), 0);
  return used + sizeOf(next) <= QUEUE_MAX_BYTES;
}

// The ones still to send, oldest first; refused ones wait for the person instead.
export function pending(queued: readonly QueuedCapture[]): QueuedCapture[] {
  return queued.filter((capture) => capture.refused === undefined).sort((a, b) => a.at - b.at);
}

export type Flushed = {
  made: { capture: QueuedCapture; item: string }[];
  refused: QueuedCapture[];
  // The PC stopped answering partway: what is left waits for the next try.
  unheard: boolean;
};

// Sends what waits, oldest first, and stops at the first send the PC does not answer.
export async function flush(store: QueueStore, send: Sender): Promise<Flushed> {
  const out: Flushed = { made: [], refused: [], unheard: false };
  for (const capture of pending(await store.all())) {
    let sent: Sent;
    try {
      sent = await send(capture);
    } catch {
      sent = { kind: 'unheard' };
    }
    if (sent.kind === 'unheard') {
      out.unheard = true;
      break;
    }
    if (sent.kind === 'made') {
      await store.remove(capture.id);
      out.made.push({ capture, item: sent.item });
    } else {
      const kept = { ...capture, refused: sent.message };
      await store.put(kept);
      out.refused.push(kept);
    }
  }
  return out;
}

// One flush at a time per page or worker: a second call while one runs gets the same result.
export function serialFlush(run: () => Promise<Flushed>): () => Promise<Flushed> {
  let running: Promise<Flushed> | null = null;
  return () => {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  };
}

// The request a capture becomes: the same create the sheet sends when the PC answers (a form when
// it has a photo), with its id as the Idempotency-Key.
export function captureRequest(capture: QueuedCapture): { init: RequestInit; url: string } {
  const payload = { collection: capture.board, type: capture.type, fields: capture.fields };
  const headers: Record<string, string> = {
    accept: 'application/json',
    'idempotency-key': capture.id,
  };
  const { photo } = capture;
  if (!photo) {
    return {
      url: '/api/items',
      init: {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    };
  }
  const form = new FormData();
  form.append('item', JSON.stringify({ ...payload, evidence: [{ role: photo.role }] }));
  form.append('file', new Blob([photo.bytes], { type: photo.type }), photo.name);
  return { url: '/api/items', init: { method: 'POST', headers, body: form } };
}

// Not heard: no answer, the door's own (nothing behind Tailscale serve), a timeout or too many
// requests, or a phone the PC no longer knows (paired again, it sends then). Anything else the PC
// said is its answer: a refusal kept with its words.
const UNHEARD = new Set([401, 408, 429, 500, 502, 503, 504]);

export function sendWith(fetcher: typeof fetch): Sender {
  return async (capture) => {
    const { url, init } = captureRequest(capture);
    let response: Response;
    try {
      response = await fetcher(url, init);
    } catch {
      return { kind: 'unheard' };
    }
    if (UNHEARD.has(response.status)) return { kind: 'unheard' };
    const body: unknown = await response.json().catch(() => undefined);
    if (response.ok) {
      const id = (body as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' ? { kind: 'made', item: id } : { kind: 'unheard' };
    }
    const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
    return {
      kind: 'refused',
      message: typeof message === 'string' ? message : `HTTP ${response.status}`,
    };
  };
}

// A new capture's id: random, so two phones (or two tries) never share one. getRandomValues, not
// randomUUID: the local network's plain HTTP has no randomUUID.
type Fill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

export function captureId(fill: Fill = (b) => crypto.getRandomValues(b)): string {
  const bytes = fill(new Uint8Array(16));
  return `cap-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
