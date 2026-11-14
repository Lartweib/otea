import type { ArchivedBoard, ArchivePlan, DeletePlan } from '../../../src/app/board-archive.ts';
import type {
  BoardRecord,
  BoardSummary,
  PairRoles,
  PublishPairResult,
  PublishPlan,
  PublishResult,
  RestorePairResult,
} from '../../../src/app/boards.ts';
import type { BoardDefinition, Target } from '../../../src/core/board/model.ts';
import type { Problem } from '../../../src/core/board/problems.ts';
import type { Lang, TemplateView } from '../../../src/core/board/templates.ts';
import { serverMessage, unreachable } from '../remote.ts';

// The board Studio's client for /api/boards and /api/templates (src/server/boards.ts). Every
// failure throws an Error whose message is the server's reason in words (or "unreachable"), never
// swallowed: a caller shows it and offers Reintentar.

export type {
  ArchivedBoard,
  ArchivePlan,
  BoardRecord,
  BoardSummary,
  DeletePlan,
  PairRoles,
  PublishPairResult,
  PublishPlan,
  PublishResult,
  RestorePairResult,
  TemplateView,
};

// A failed request, with the server's code when it gave one (board_conflict, not_publishable…).
export class StudioRequestError extends Error {
  readonly code: string | undefined;
  readonly status: number;

  constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.name = 'StudioRequestError';
    this.status = status;
    this.code = code;
  }
}

async function call<T>(method: string, path: string, given?: unknown, signal?: AbortSignal) {
  // The server takes a write only as JSON (src/server/writes.ts): one with nothing to say sends {}.
  const payload = given === undefined && method !== 'GET' ? {} : given;
  const response = await fetch(path, {
    method,
    headers: {
      accept: 'application/json',
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    ...(signal ? { signal } : {}),
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new StudioRequestError(unreachable(), 0, undefined);
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body as T;
  const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
  throw new StudioRequestError(
    serverMessage(body, response.status),
    response.status,
    typeof code === 'string' ? code : undefined,
  );
}

const board = (id: string) => `/api/boards/${encodeURIComponent(id)}`;

export async function fetchBoards(signal?: AbortSignal): Promise<BoardSummary[]> {
  return (await call<{ boards: BoardSummary[] }>('GET', '/api/boards', undefined, signal)).boards;
}

export async function fetchTemplates(lang: Lang, signal?: AbortSignal): Promise<TemplateView[]> {
  const path = `/api/templates?lang=${lang}`;
  return (await call<{ templates: TemplateView[] }>('GET', path, undefined, signal)).templates;
}

export function fetchBoard(
  id: string,
  signal?: AbortSignal,
): Promise<{ record: BoardRecord; problems: Problem[] }> {
  return call('GET', board(id), undefined, signal);
}

export function createBoard(input: {
  name: string;
  item?: string;
  template?: string;
  lang: Lang;
}): Promise<BoardRecord> {
  return call('POST', '/api/boards', input);
}

// A template that makes several boards (TemplateView.boards): every board as a draft, in the
// set's order, the split joining them already.
export async function createBoardSet(input: {
  set: string;
  lang: Lang;
  boards: { name?: string; item?: string }[];
}): Promise<BoardRecord[]> {
  const { records } = await call<{ records: BoardRecord[] }>('POST', '/api/boards/set', input);
  return records;
}

// `draftStamp`: the draft's updatedAt the editor last saw (null: none); the server refuses the
// write when the draft changed since, instead of overwriting what arrived.
export function saveDraft(
  id: string,
  definition: BoardDefinition,
  baseVersion: number | null,
  draftStamp?: string | null,
): Promise<{ record: BoardRecord; problems: Problem[] }> {
  const stamp = draftStamp === undefined ? {} : { draftStamp };
  return call('PUT', `${board(id)}/draft`, { definition, baseVersion, ...stamp });
}

export function discardDraft(id: string): Promise<{ deleted: boolean }> {
  return call('DELETE', `${board(id)}/draft`);
}

export function fetchPublishPlan(id: string): Promise<PublishPlan> {
  return call('POST', `${board(id)}/publish/plan`);
}

// `closeRequest`: also close, as done, the open Pedido an agent drafted the board on.
export function publishBoard(
  id: string,
  moves: Readonly<Record<string, Target>>,
  draftStamp?: string | null,
  closeRequest = false,
): Promise<PublishResult> {
  const stamp = draftStamp === undefined ? {} : { draftStamp };
  const close = closeRequest ? { closeRequest } : {};
  return call('POST', `${board(id)}/publish`, { moves, ...stamp, ...close });
}

// Undo publish: `version` is the one live before (null undoes a first publish).
export function restoreBoard(id: string, version: number | null): Promise<BoardRecord> {
  return call('POST', `${board(id)}/restore`, { version });
}

// A joined pair (pair.ts): both boards published as one, the child first; a role is published
/// only when `moves` names it (only one board had changes). All or nothing.
export function publishPair(input: {
  parent: string;
  child: string;
  moves: PairRoles<Readonly<Record<string, Target>>>;
  draftStamps?: PairRoles<string | null>;
}): Promise<PublishPairResult> {
  return call('POST', '/api/boards/publish-pair', input);
}

// The joint publish's Deshacer: each named role back to its version (null undoes a first publish).
export function restorePair(input: {
  parent: string;
  child: string;
  versions: PairRoles<number | null>;
}): Promise<RestorePairResult> {
  return call('POST', '/api/boards/restore-pair', input);
}

// An agent's draft: handing it in (otea board draft --file) merges it into the board's draft, so the
// home sees it arrive; merge-by-id stays for merging a handed-in file again.
// (Lo que lee el agente needs no route: the preview runs core/board/next.ts on the draft.)

export type AgentDraftRequest = { name: string; need: string; agent: string | null; lang: Lang };

// "Que lo esboce un agente": a Pedido and a waiting board.
export function requestAgentDraft(
  input: AgentDraftRequest,
): Promise<{ board: BoardRecord; item: string }> {
  return call('POST', '/api/boards/agent-draft', input);
}

export function mergeAgentDraft(id: string, evidence: number): Promise<BoardRecord> {
  return call('POST', `${board(id)}/draft/merge`, { evidence });
}

// Archiving, restoring and deleting a board (src/app/board-archive.ts): the plans the dialogs
// read first, and the acts.
export function fetchArchivePlan(id: string): Promise<ArchivePlan> {
  return call('GET', `${board(id)}/archive/plan`);
}

export function archiveBoard(id: string): Promise<{ archived: string[] }> {
  return call('POST', `${board(id)}/archive`);
}

export function unarchiveBoard(id: string): Promise<{ restored: string[] }> {
  return call('POST', `${board(id)}/unarchive`);
}

export function fetchDeletePlan(id: string): Promise<DeletePlan> {
  return call('GET', `${board(id)}/delete/plan`);
}

// `confirm`: the board's name as the person typed it, when the delete takes items with it.
export function deleteBoard(id: string, confirm?: string): Promise<{ deleted: string[] }> {
  return call('DELETE', board(id), confirm === undefined ? {} : { confirm });
}

export async function fetchArchivedBoards(signal?: AbortSignal): Promise<ArchivedBoard[]> {
  const path = '/api/boards/archived';
  return (await call<{ boards: ArchivedBoard[] }>('GET', path, undefined, signal)).boards;
}
