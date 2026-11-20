import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

// For the tests that press: the page drawn by React's own root into a DOM, a press or a typed
// value dispatched as the browser does, and what the page sent to the server. A file that uses it
// runs in a DOM (`// @vitest-environment happy-dom` at its top).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A browser marks a canceled animation's `finished` promise as handled (Web Animations), so a page
// that never awaits it stays quiet; happy-dom leaves it an unhandled rejection. Marked here first.
if (typeof Animation !== 'undefined') {
  const cancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function (this: Animation) {
    this.finished.catch(() => undefined);
    cancel.call(this);
  };
}

export type Mounted = { root: HTMLElement; unmount: () => void };

export function mount(node: ReactNode): Mounted {
  const root = document.createElement('div');
  document.body.append(root);
  let react: Root | undefined;
  act(() => {
    react = createRoot(root);
    react.render(node);
  });
  return {
    root,
    unmount: () => {
      act(() => react?.unmount());
      root.remove();
    },
  };
}

// Lets what a press started settle: the fetches it awaits, the renders after them.
export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function press(el: Element | null | undefined): Promise<void> {
  if (!(el instanceof HTMLElement)) throw new Error('nothing to press');
  await act(async () => el.click());
  await settle();
}

// Types into a text box as the person does: React hears the input event.
export async function typeInto(el: Element | null | undefined, text: string): Promise<void> {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
    throw new Error('no text box to type into');
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// The button whose own text is `text`, exactly.
export function buttonNamed(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

export type Sent = { method: string; url: string; body: unknown };

// What an item page reads beside the item, each answered as a server with nothing to say: no file
// opened yet, no push outside Otea, no topic, no board.
const QUIET: Readonly<Record<string, unknown>> = {
  opened: { evidence: [] },
  drift: { drift: null },
  'merged-outside': { merged: null },
  'diff-tip': { off: null },
  topics: { linked: [], suggested: [] },
  boards: { boards: [] },
};

// The server as the page reaches it: every write recorded as sent, each read answered by `read`
// (a JSON value for its path, or undefined), then as a quiet server, else with a 404.
export function stubServer(read: (path: string) => unknown = () => undefined): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init.method ?? 'GET').toUpperCase();
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (method === 'GET') {
      const path = new URL(url, 'http://127.0.0.1').pathname;
      const value = read(path) ?? QUIET[path.split('/').pop() ?? ''];
      return value === undefined ? json({ error: { code: 'not_found' } }, 404) : json(value);
    }
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body;
    sent.push({ method, url, body });
    return json({});
  });
  return sent;
}
