import type { FeedEvent } from './activity.ts';
import type { WrittenBrief } from './brief.ts';
import { t } from './i18n/i18n.ts';
import { type Agent, parseAgents } from './presence.ts';
import type { LinkRequest } from './relations.ts';
import { serverMessage, unreachable } from './remote.ts';
import type {
  CollectionView,
  EvidenceRole,
  Item,
  ItemView,
  PresetView,
  ProjectView,
  Session,
} from './types.ts';

async function get(path: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (!response.ok && response.status !== 404) {
    throw new Error(t('error.getFailed', { path, status: response.status }));
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

// A brief for the items, in the order given; limits and success left out take the brief's defaults.
export function writeBrief(request: {
  ids: readonly string[];
  limits?: readonly string[];
  success?: readonly string[];
}): Promise<WrittenBrief> {
  return post<WrittenBrief>('/api/brief', request);
}

// The project's event log across items: the newest `latest` events, or those after the `since` cursor.
export async function fetchEvents(
  query: { latest: number } | { since: number },
  signal: AbortSignal,
): Promise<FeedEvent[]> {
  const search = 'latest' in query ? `latest=${query.latest}` : `since=${query.since}`;
  return (await get(`/api/events?${search}`, signal)).json();
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

export async function fetchProject(signal: AbortSignal): Promise<ProjectView> {
  return (await get('/api/project', signal)).json();
}

// The agents seen in this project, or null when the server has no presence to tell (it answers
// 404): the topbar then shows no agents pill at all.
export async function fetchAgents(signal: AbortSignal): Promise<Agent[] | null> {
  const response = await get('/api/agents', signal);
  return response.status === 404 ? null : parseAgents(await response.json());
}

export async function fetchPresets(signal: AbortSignal): Promise<PresetView[]> {
  return (await get('/api/presets', signal)).json();
}

// A form sets its own content type (with the boundary); JSON says it.
async function post<T>(path: string, payload: unknown): Promise<T> {
  const form = payload instanceof FormData;
  const response = await fetch(path, {
    method: 'POST',
    headers: form
      ? { accept: 'application/json' }
      : { accept: 'application/json', 'content-type': 'application/json' },
    body: form ? payload : JSON.stringify(payload),
  }).catch(() => {
    throw new Error(unreachable());
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body as T;
  throw new Error(serverMessage(body, response.status));
}

export async function moveItem(id: string, to: string, reason: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/move`, reason === '' ? { to } : { to, reason });
}

export type NewFile = { file: File; role: EvidenceRole };

// parent: the item the new one is created under, as its child. files: attached as evidence in the
// same write, sent as a form (the item's JSON in its "item" part, each file in a "file" part).
export function createItem(
  collection: string,
  type: string,
  fields: Record<string, string>,
  parent?: string,
  files: readonly NewFile[] = [],
): Promise<Item> {
  const payload = { collection, type, fields, ...(parent === undefined ? {} : { parent }) };
  if (files.length === 0) return post<Item>('/api/items', payload);
  const form = new FormData();
  form.append(
    'item',
    JSON.stringify({ ...payload, evidence: files.map(({ role }) => ({ role })) }),
  );
  for (const { file } of files) form.append('file', file, file.name);
  return post<Item>('/api/items', form);
}

export async function linkItems({ id, kind, other }: LinkRequest): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/link`, { kind, other });
}

export async function unlinkItems({ id, kind, other }: LinkRequest): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/unlink`, { kind, other });
}
