import type {
  BoardRecord,
  BoardSummary,
  PublishPlan,
  PublishResult,
} from '../../../src/app/boards.ts';
import type { BoardDefinition, Target } from '../../../src/core/board/model.ts';
import type { Problem } from '../../../src/core/board/problems.ts';
import type { Lang, TemplateView } from '../../../src/core/board/templates.ts';
import { serverMessage, unreachable } from '../remote.ts';

// The board Studio's client for /api/boards and /api/templates (src/server/boards.ts). Every
// failure throws an Error whose message is the server's reason in words (or "unreachable"), never
// swallowed: a caller shows it and offers Reintentar.

export type { BoardRecord, BoardSummary, PublishPlan, PublishResult, TemplateView };

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

async function call<T>(method: string, path: string, payload?: unknown, signal?: AbortSignal) {
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

export function saveDraft(
  id: string,
  definition: BoardDefinition,
  baseVersion: number | null,
): Promise<{ record: BoardRecord; problems: Problem[] }> {
  return call('PUT', `${board(id)}/draft`, { definition, baseVersion });
}

export function discardDraft(id: string): Promise<{ deleted: boolean }> {
  return call('DELETE', `${board(id)}/draft`);
}

export function fetchPublishPlan(id: string): Promise<PublishPlan> {
  return call('POST', `${board(id)}/publish/plan`);
}

export function publishBoard(
  id: string,
  moves: Readonly<Record<string, Target>>,
): Promise<PublishResult> {
  return call('POST', `${board(id)}/publish`, { moves });
}

// Undo publish: `version` is the one live before (null undoes a first publish).
export function restoreBoard(id: string, version: number | null): Promise<BoardRecord> {
  return call('POST', `${board(id)}/restore`, { version });
}

// The routes below answer 501 until the server slice builds them; their shapes are the contract.

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

export type AgentPreview = { next: string; refusal: string | null };

// "Lo que lee el agente": next's answer at a step and phase of the draft, and the refusal of an
// empty handoff.
export function fetchAgentPreview(
  id: string,
  step: string,
  phase: 'doing' | 'review',
  signal?: AbortSignal,
): Promise<AgentPreview> {
  const query = `step=${encodeURIComponent(step)}&phase=${phase}`;
  return call('GET', `${board(id)}/draft/next-preview?${query}`, undefined, signal);
}
