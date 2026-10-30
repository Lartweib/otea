import type { LinkRequest } from './relations.ts';
import { serverMessage, UNREACHABLE } from './remote.ts';
import type { CollectionView, Item, ItemView, PresetView, Session } from './types.ts';

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

// Served only to a signed-in browser, as a download unless it is an image, a video or plain text.
export function evidenceFileUrl(id: number): string {
  return `/api/evidence/${id}/file`;
}

export async function fetchSession(signal: AbortSignal): Promise<Session> {
  return (await get('/api/session', signal)).json();
}

export async function fetchCollections(signal: AbortSignal): Promise<CollectionView[]> {
  return (await get('/api/collections', signal)).json();
}

export async function fetchPresets(signal: AbortSignal): Promise<PresetView[]> {
  return (await get('/api/presets', signal)).json();
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error(UNREACHABLE);
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body as T;
  throw new Error(serverMessage(body, response.status));
}

export async function moveItem(id: string, to: string, reason: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/move`, reason === '' ? { to } : { to, reason });
}

// parent: the item the new one is created under, as its child.
export function createItem(
  collection: string,
  type: string,
  fields: Record<string, string>,
  parent?: string,
): Promise<Item> {
  const payload = { collection, type, fields, ...(parent === undefined ? {} : { parent }) };
  return post<Item>('/api/items', payload);
}

export async function linkItems({ id, kind, other }: LinkRequest): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/link`, { kind, other });
}

export async function unlinkItems({ id, kind, other }: LinkRequest): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/unlink`, { kind, other });
}
