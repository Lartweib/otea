import { serverMessage, UNREACHABLE } from './remote.ts';
import type { Item, ItemView, Session } from './types.ts';

async function get(path: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (!response.ok && response.status !== 404) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return response;
}

export async function fetchItems(signal: AbortSignal): Promise<Item[]> {
  return (await get('/api/items', signal)).json();
}

export async function fetchItem(id: string, signal: AbortSignal): Promise<ItemView | null> {
  const response = await get(`/api/items/${encodeURIComponent(id)}`, signal);
  return response.status === 404 ? null : response.json();
}

export async function fetchSession(signal: AbortSignal): Promise<Session> {
  return (await get('/api/session', signal)).json();
}

export async function moveItem(id: string, to: string, reason: string): Promise<void> {
  const body = JSON.stringify(reason === '' ? { to } : { to, reason });
  const response = await fetch(`/api/items/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body,
  }).catch(() => {
    throw new Error(UNREACHABLE);
  });
  if (response.ok) return;
  throw new Error(serverMessage(await response.json().catch(() => undefined), response.status));
}
