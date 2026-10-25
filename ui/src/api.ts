import type { Item, ItemWithEvents } from './types.ts';

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

export async function fetchItem(id: string, signal: AbortSignal): Promise<ItemWithEvents | null> {
  const response = await get(`/api/items/${encodeURIComponent(id)}`, signal);
  return response.status === 404 ? null : response.json();
}
