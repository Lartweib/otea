import type { MergedOutside } from '../../src/cli/merged-outside.ts';
import { withoutUndone } from '../../src/core/board/history.ts';
import type { PerformanceView } from '../../src/core/board/performance.ts';
import type { NotifyPrefs } from '../../src/core/notify/planner.ts';
import type { DiffOffTip } from '../../src/server/diff-tip.ts';
import type { Drift } from '../../src/server/drift.ts';
import type { FeedEvent } from './activity.ts';
import { apiUrl } from './base.ts';
import type { WrittenBrief } from './brief.ts';
import { type Language, t } from './i18n/i18n.ts';
import type { NotifyView } from './notify/offer.ts';
import { noteRead, readOf } from './offline/sync-state.ts';
import { type Agent, parseAgents } from './presence.ts';
import type { LinkRequest } from './relations.ts';
import { serverMessage, unreachable } from './remote.ts';
import type { ItemTopics, Topic, TopicsView } from './topics.ts';
import type {
  CollectionView,
  EvidenceRole,
  GitHookInstall,
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
  TailscaleGuide,
  TestPush,
  TransportKind,
} from './types.ts';
import { type AgentDetail, parseAgentDetail } from './views/agent/agent-sheet.ts';

async function get(path: string, signal: AbortSignal): Promise<Response> {
  // Every read says whether the PC answered it (the offline line, sync-state.ts).
  const response = await fetch(apiUrl(path), {
    signal,
    headers: { accept: 'application/json' },
  }).catch((error: unknown) => {
    if (!signal.aborted) noteRead({ kind: 'failed' });
    throw error;
  });
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

// No such item reads null: the server answers null for it (never a 404 the console would show).
export async function fetchItem(id: string, signal: AbortSignal): Promise<ItemView | null> {
  const response = await get(`/api/items/${encodeURIComponent(id)}?missing=null`, signal);
  if (response.status === 404) return null;
  const item = (await response.json()) as ItemView | null;
  if (!item) return null;
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
  return apiUrl(`/api/evidence/${id}/file`);
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
  const response = await fetch(apiUrl(path), {
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

// The option picked with an approval, on a board item that carries options, and why.
export type MoveChoiceInput = { option: string; comment?: string };

export async function moveItem(
  id: string,
  to: string,
  reason: string,
  choice?: MoveChoiceInput,
): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/move`, {
    to,
    ...(reason === '' ? {} : { reason }),
    ...(choice ? { choice } : {}),
  });
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

// An item an agent set aside for later: the person takes it up again (Retomar), so next and wait
// offer it to every agent once more, the one that set it aside too.
export async function resumeItem(id: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/resume`, {});
}

// The person's order of the work (app/priority.ts): «Fijar el orden» from a board's matrix (the
// items in order; the board's earlier order goes), and «Poner arriba» / «Quitar de arriba».
export async function setOrder(collection: string, ids: readonly string[]): Promise<void> {
  await post('/api/order', { collection, ids });
}

export async function pinItems(ids: readonly string[], pinned: boolean): Promise<void> {
  await post('/api/pin', { ids, pinned });
}

// Where a note is on: a piece of evidence of the item by its id, and in it the moment of a
// recording, a line of a text, a node of a diagram, or a point or zone of an image (in percent).
export type NoteAnchorInput = {
  evidence: number;
  seconds?: number;
  line?: number;
  quote?: string;
  node?: string;
  page?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

// A note to the agent doing the item's step: it moves nothing; `anchor` is a piece of evidence of
// the item, by its id, and for a recording the moment seen.
export async function postNote(id: string, text: string, anchor?: NoteAnchorInput): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/notes`, anchor ? { text, anchor } : { text });
}

// A review comment of the review still open, changed or taken back before it goes (P5-3).
export async function editNote(id: string, note: number, text: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/notes/${note}/edit`, { text });
}

export async function withdrawNote(id: string, note: number): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/notes/${note}/withdraw`, {});
}

// The files of an item the person opened in the reader, on any device, by evidence id.
export async function fetchOpened(id: string, signal: AbortSignal): Promise<number[]> {
  const body = (await (
    await get(`/api/items/${encodeURIComponent(id)}/opened`, signal)
  ).json()) as {
    evidence: number[];
  };
  return body.evidence;
}

// What a clone without Otea's hook pushed to the branch of an item in review since its handoff
// (src/server/drift.ts): null when nothing moved, or when the PC cannot tell.
export async function fetchDrift(id: string, signal: AbortSignal): Promise<Drift | null> {
  const body = (await (await get(`/api/items/${encodeURIComponent(id)}/drift`, signal)).json()) as {
    drift: Drift | null;
  };
  return body.drift;
}

// Whether git shows the branch of an item in its land step in the base already, merged outside
// Otea (src/cli/merged-outside.ts, P1-R3-9): null otherwise.
export async function fetchMergedOutside(
  id: string,
  signal: AbortSignal,
): Promise<MergedOutside | null> {
  const url = `/api/items/${encodeURIComponent(id)}/merged-outside`;
  const body = (await (await get(url, signal)).json()) as { merged: MergedOutside | null };
  return body.merged;
}

// Whether the attached diff of an item in review comes from another tip than the one handed off
// (src/server/diff-tip.ts, P1-R3-1): null when it matches, or when the PC cannot tell.
export async function fetchDiffOffTip(id: string, signal: AbortSignal): Promise<DiffOffTip | null> {
  const url = `/api/items/${encodeURIComponent(id)}/diff-tip`;
  const body = (await (await get(url, signal)).json()) as { off: DiffOffTip | null };
  return body.off;
}

export async function postOpened(id: string, evidence: number): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/opened`, { evidence });
}

// Your answer to an agent's question (otea ask): the turn goes back to the agent, in the same round.
export async function postAnswer(id: string, text: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/answer`, { text });
}

export async function undoRelease(id: string): Promise<void> {
  await post(`/api/items/${encodeURIComponent(id)}/undo`, { release: true });
}

// module: the part (evidence module) it goes to, when the type has several that take it.
export type NewFile = { file: File; role: EvidenceRole; module?: string };

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
    JSON.stringify({
      ...payload,
      evidence: files.map(({ role, module }) =>
        module === undefined ? { role } : { role, module },
      ),
    }),
  );
  for (const { file } of files) form.append('file', file, file.name);
  return post<Item>('/api/items', form, key);
}

// Files the person adds to an item that exists (ONB-18), sent as a form: each file in a "file"
// part. On a board they go where the person's files go, outside the parts the agents hand.
export async function attachFiles(id: string, files: readonly File[]): Promise<void> {
  const form = new FormData();
  for (const file of files) form.append('file', file, file.name);
  await post(`/api/items/${encodeURIComponent(id)}/evidence`, form);
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

// What the pairing dialog opens on: a new code, unless the current one was issued or read by a
// phone a moment ago (another tab, otea serve, a phone pairing now).
export function freshPairingCode(address?: string): Promise<LanView> {
  return post<LanView>(`/api/lan/code/fresh${lanQuery(address)}`, {});
}

// The phone transport, its URL and whether Otea answers there (this computer's browser only).
export async function fetchPhone(signal: AbortSignal): Promise<PhoneStatus> {
  return (await get('/api/phone', signal)).json();
}

// Opens the local network to phones while otea serve runs, and keeps it open for the next one;
// closing it stops listening there (this computer's browser only).
export function openLan(): Promise<PhoneStatus> {
  return post<PhoneStatus>('/api/lan/open', {});
}

export function closeLan(): Promise<PhoneStatus> {
  return post<PhoneStatus>('/api/lan/close', {});
}

// Chooses the phone transport; Tailscale is set up on this computer first and kept once ready.
export function choosePhoneTransport(transport: TransportKind): Promise<PhoneStatus> {
  return post<PhoneStatus>('/api/phone', { transport });
}

// The guided path to Tailscale: each step, done or still to do. It changes nothing.
export async function fetchTailscaleGuide(signal: AbortSignal): Promise<TailscaleGuide> {
  return (await get('/api/phone/tailscale', signal)).json();
}

// Runs the command the guide showed, word for word, once the person confirmed it.
export function serveOverTailscale(command: string): Promise<PhoneStatus> {
  return post<PhoneStatus>('/api/phone/tailscale/serve', { command });
}

// Preferencias › Avisos: this device's push subscription and what it is told, or the desktop
// app's notices (notify/).
export async function fetchNotify(signal: AbortSignal): Promise<NotifyView> {
  return (await get('/api/notify', signal)).json();
}

export function postSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  lang: Language,
): Promise<NotifyView> {
  return post<NotifyView>('/api/notify/subscribe', { ...subscription, lang });
}

export function postUnsubscribe(): Promise<NotifyView> {
  return post<NotifyView>('/api/notify/unsubscribe', {});
}

// This browser no longer holds the subscription the server pushes to (TS-3).
export function postLost(): Promise<NotifyView> {
  return post<NotifyView>('/api/notify/lost', {});
}

export function postNotifyPrefs(prefs: NotifyPrefs, lang: Language): Promise<NotifyView> {
  return post<NotifyView>('/api/notify/prefs', { prefs, lang });
}

// One push now to this phone (Preferencias › Avisos), or to a paired device (the desk's list).
export function postTestPush(): Promise<TestPush> {
  return post<TestPush>('/api/notify/test', {});
}

export function postDeviceTestPush(id: string): Promise<TestPush> {
  return post<TestPush>(`/api/devices/${encodeURIComponent(id)}/test-push`, {});
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
  const response = await fetch(apiUrl(path), {
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

// What to paste into an agent's chat, in the screen's language: without a kind, the project's
// moment (the first contact while it has no board of its own, then one more agent joining).
// `first`: a join prompt for a project's first agent, which connects since nobody else works there.
export type AgentPromptView = {
  kind: 'start' | 'join' | 'design';
  prompt: string;
  first?: boolean;
};

export async function fetchAgentPrompt(
  kind: AgentPromptView['kind'] | undefined,
  lang: string,
  signal: AbortSignal,
): Promise<AgentPromptView> {
  const query = new URLSearchParams({ lang, ...(kind ? { kind } : {}) });
  return (await get(`/api/agent-prompt?${query}`, signal)).json();
}

export async function fetchProjectSettings(signal: AbortSignal): Promise<ProjectSettings> {
  return (await get('/api/project/settings', signal)).json();
}

// Otea's pre-push hook in every repo of the project that has none (Publicar's offer, P2S-R3-1).
export async function installGitHook(): Promise<GitHookInstall> {
  return post<GitHookInstall>('/api/project/git-hook', {});
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

// Side topics (topics.ts): the list and whether the project keeps them; one topic's note, close
// and conversion into a task; an item's linked and suggested topics.
// `search`: words a topic found mentions, any of them, the most first, closed ones too (the page's search box).
// `everywhere`: in every project this computer serves, each topic and item with its project.
export async function fetchTopics(
  signal: AbortSignal,
  all = false,
  search = '',
  everywhere = false,
): Promise<TopicsView> {
  const query = new URLSearchParams();
  if (all) query.set('all', '1');
  if (search.trim() !== '') query.set('search', search.trim());
  if (everywhere) query.set('projects', 'all');
  const qs = query.toString();
  return (await get(`/api/topics${qs === '' ? '' : `?${qs}`}`, signal)).json();
}

export async function switchTopics(on: boolean): Promise<TopicsView> {
  return post('/api/topics/switch', { on });
}

export async function noteOnTopic(id: string, text: string): Promise<Topic> {
  return post(`/api/topics/${encodeURIComponent(id)}/notes`, { text });
}

export async function closeTopicNow(id: string): Promise<Topic> {
  return post(`/api/topics/${encodeURIComponent(id)}/close`, {});
}

export async function convertTopicTo(id: string, item: string): Promise<Topic> {
  return post(`/api/topics/${encodeURIComponent(id)}/convert`, { item });
}

export async function fetchItemTopics(id: string, signal: AbortSignal): Promise<ItemTopics> {
  return (await get(`/api/items/${encodeURIComponent(id)}/topics`, signal)).json();
}

export async function answerTopicSuggestion(
  item: string,
  topic: string,
  answer: 'confirm' | 'dismiss',
): Promise<void> {
  await post(
    `/api/items/${encodeURIComponent(item)}/topics/${encodeURIComponent(topic)}/${answer}`,
    {},
  );
}
