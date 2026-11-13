import { withoutUndone } from '../../src/core/board/history.ts';
import type { PerformanceView } from '../../src/core/board/performance.ts';
import type { FeedEvent } from './activity.ts';
import type { WrittenBrief } from './brief.ts';
import { t } from './i18n/i18n.ts';
import { noteRead, readOf } from './offline/sync-state.ts';
import { type Agent, parseAgents } from './presence.ts';
import type { LinkRequest } from './relations.ts';
import { serverMessage, unreachable } from './remote.ts';
import type {
  CollectionView,
  EvidenceRole,
  Item,
  ItemView,
  LanView,
  Paired,
  PairingPeek,
  PhoneStatus,
  PresetView,
  ProjectOverview,
  ProjectSettings,
  ProjectView,
  Session,
  TransportKind,
} from './types.ts';
import { type AgentDetail, parseAgentDetail } from './views/agent/agent-sheet.ts';

async function get(path: string, signal: AbortSignal): Promise<Response> {
  // Every read says whether the PC answered it (the offline line, sync-state.ts).
  const response = await fetch(path, { signal, headers: { accept: 'application/json' } }).catch(
    (error: unknown) => {
      if (!signal.aborted) noteRead({ kind: 'failed' });
      throw error;
    },
  );
  noteRead(readOf(response.headers));
  // A device on the LAN whose token was revoked (or never paired) goes back to the pairing screen.
  if (response.status === 401) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if ((body as { error?: { code?: unknown } } | undefined)?.error?.code === 'unpaired') {
      window.location.assign('/pair');
    }
  }
  if (!response.ok && response.status !== 404) {
    throw new Error(t('error.getFailed', { path, status: response.status }));
  }
  return response;
}

// How each model performs (Rendimiento), on one board or all of them, over a period.
export async function fetchPerformance(
  query: { board?: string | undefined; since: string },
  signal: AbortSignal,
): Promise<PerformanceView> {
  const params = new URLSearchParams({ since: query.since });
  if (query.board) params.set('board', query.board);
  return (await get(`/api/performance?${params}`, signal)).json();
}

export async function fetchItems(signal: AbortSignal): Promise<Item[]> {
  return (await get('/api/items', signal)).json();
}

export async function fetchItem(id: string, signal: AbortSignal): Promise<ItemView | null> {
  const response = await get(`/api/items/${encodeURIComponent(id)}`, signal);
  if (response.status === 404) return null;
  const item = (await response.json()) as ItemView;
  return { ...item, events: withoutUndone(item.events) };
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

// One agent's sheet: every profile it declared and the steps it may take; null when Otea does not
// know it.
export async function fetchAgent(name: string, signal: AbortSignal): Promise<AgentDetail | null> {
  const response = await get(`/api/agents/${encodeURIComponent(name)}`, signal);
  return response.status === 404 ? null : parseAgentDetail(await response.json());
}

export async function fetchPresets(signal: AbortSignal): Promise<PresetView[]> {
  return (await get('/api/presets', signal)).json();
}

// A write the PC did not hear: no answer, or the door's own with nothing behind it (Tailscale serve
// answers 502 while Otea is not running). A capture keeps it in the queue instead of losing it.
export class Unheard extends Error {
  override readonly name = 'Unheard';
}

// A form sets its own content type (with the boundary); JSON says it.
async function post<T>(
  path: string,
  payload: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const form = payload instanceof FormData;
  const response = await fetch(path, {
    method: 'POST',
    headers: form
      ? { accept: 'application/json', ...extra }
      : { accept: 'application/json', 'content-type': 'application/json', ...extra },
    body: form ? payload : JSON.stringify(payload),
  }).catch(() => {
    throw new Unheard(unreachable());
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body as T;
  if ([502, 503, 504].includes(response.status)) throw new Unheard(unreachable());
  throw new Error(serverMessage(body, response.status));
}

export async function moveItem(id: string, to: string, reason: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/move`, reason === '' ? { to } : { to, reason });
}

// Fills fields of an item as the person (the own step's "Rellenar"), keyed by part id.
export async function updateItemFields(id: string, fields: Record<string, string>): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/update`, { fields });
}

// Takes back your last move, while its toast is up: the item returns to `from`, the state it left.
export async function undoMove(id: string, from: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/undo`, { from });
}

// A stuck item (Atasco): back in the queue of its step for any agent (Retomar), or left for the
// agent picked (Reasignar); Deshacer gives the lease that ran out back, while the toast is up.
export async function restartItem(id: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/restart`, {});
}

export async function reassignItem(id: string, agent: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/reassign`, { agent });
}

// A note to the agent doing the item's step: it moves nothing; `anchor` is a piece of evidence of
// this round, by its id, and for a recording the moment seen.
export async function postNote(
  id: string,
  text: string,
  anchor?: { evidence: number; seconds?: number },
): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/notes`, anchor ? { text, anchor } : { text });
}

// Your answer to an agent's question (otea ask): the turn goes back to the agent, in the same round.
export async function postAnswer(id: string, text: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/answer`, { text });
}

export async function undoRelease(id: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/undo`, { release: true });
}

export type NewFile = { file: File; role: EvidenceRole };

// parent: the item the new one is created under, as its child. files: attached as evidence in the
// same write, sent as a form (the item's JSON in its "item" part, each file in a "file" part).
// clientKey: the create's Idempotency-Key, so sending it again never makes a second item.
export function createItem(
  collection: string,
  type: string,
  fields: Record<string, string>,
  parent?: string,
  files: readonly NewFile[] = [],
  clientKey?: string,
): Promise<Item> {
  const payload = { collection, type, fields, ...(parent === undefined ? {} : { parent }) };
  const key: Record<string, string> =
    clientKey === undefined ? {} : { 'idempotency-key': clientKey };
  if (files.length === 0) return post<Item>('/api/items', payload, key);
  const form = new FormData();
  form.append(
    'item',
    JSON.stringify({ ...payload, evidence: files.map(({ role }) => ({ role })) }),
  );
  for (const { file } of files) form.append('file', file, file.name);
  return post<Item>('/api/items', form, key);
}

export async function linkItems({ id, kind, other }: LinkRequest): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/link`, { kind, other });
}

export async function unlinkItems({ id, kind, other }: LinkRequest): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/unlink`, { kind, other });
}

const lanQuery = (address: string | undefined) =>
  address === undefined ? '' : `?address=${encodeURIComponent(address)}`;

// LAN access and the paired devices, for this computer's signed-in browser; address picks the
// network the QR code points at.
export async function fetchLan(signal: AbortSignal, address?: string): Promise<LanView> {
  return (await get(`/api/lan${lanQuery(address)}`, signal)).json();
}

export function newPairingCode(address?: string): Promise<LanView> {
  return post<LanView>(`/api/lan/code${lanQuery(address)}`, {});
}

// The phone transport, its URL and whether Otea answers there (this computer's browser only).
export async function fetchPhone(signal: AbortSignal): Promise<PhoneStatus> {
  return (await get('/api/phone', signal)).json();
}

// Chooses the phone transport; Tailscale is set up on this computer first and kept once ready.
export function choosePhoneTransport(transport: TransportKind): Promise<PhoneStatus> {
  return post<PhoneStatus>('/api/phone', { transport });
}

export async function revokeDevice(id: string): Promise<void> {
  await post(`/api/devices/${encodeURIComponent(id)}/revoke`, {});
}

// A refused pairing keeps the server's code (invalid_code, code_expired, too_many_attempts…),
// so the phone can word it in its own language.
export class PairingRefused extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function pairingCall<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new PairingRefused('unreachable', unreachable());
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body as T;
  const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  throw new PairingRefused(
    typeof error?.code === 'string' ? error.code : 'unexpected',
    typeof error?.message === 'string'
      ? error.message
      : t('error.requestFailed', { status: response.status }),
  );
}

export function peekPairing(code: string): Promise<PairingPeek> {
  return pairingCall('/api/pair/peek', { code });
}

export function pairDevice(code: string, name: string): Promise<Paired> {
  return pairingCall('/api/pair', { code, name });
}

export async function fetchProjects(signal: AbortSignal): Promise<ProjectOverview[]> {
  return (await get('/api/projects', signal)).json();
}

export async function fetchProjectSettings(signal: AbortSignal): Promise<ProjectSettings> {
  return (await get('/api/project/settings', signal)).json();
}

export async function addProjectPath(path: string): Promise<void> {
  await post('/api/project/paths', { path });
}

export async function relinkProjectPath(from: string, to: string, force: boolean): Promise<void> {
  await post('/api/project/paths/relink', { from, to, force });
}

export async function forgetProjectPath(path: string): Promise<void> {
  await post('/api/project/paths/forget', { path });
}
