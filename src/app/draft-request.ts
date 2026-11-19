import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { readDefinition } from '../core/board/schema.ts';
import type { Lang } from '../core/board/templates.ts';
import { activeLease } from '../core/lease.ts';
import { findBoard, findDraft, findVersion, listBoards } from '../store/boards.ts';
import { findItem, selectEvents } from '../store/queries.ts';
import type { Context } from './context.ts';

// A Pedido an agent drafts a board on ("Que lo esboce un agente"): the board waiting on it, and how
// the agent hands its draft in. The person's words stay the Pedido's field; how to hand it in is
// the step's instructions, which the agent reads in next and show and the page shows apart.

export const DRAFT_FILENAME = 'board.json';

// Where the agent keeps the draft of the Pedido `id` while it works on it, quoted for any shell:
// the temp folder, so no board.json is left in the repo.
export function draftPath(id: string): string {
  return `"${join(tmpdir(), `otea-${id}-${DRAFT_FILENAME}`)}"`;
}

// The Pedido's title: the board it asks for, by the name the board has now.
const TITLE: Readonly<Record<Lang, (name: string) => string>> = {
  en: (name) => `Draft the board ${name}`,
  es: (name) => `Esbozar el tablero ${name}`,
};

export function draftTitle(lang: Lang, name: string): string {
  return TITLE[lang](name.trim());
}

// The JSON Schema of board.json Otea ships, generated from the board's zod schema.
export const BOARD_JSON_SCHEMA = fileURLToPath(
  new URL('../../schemas/board.schema.json', import.meta.url),
);

// How the agent hands its draft in on the Pedido `id`: agents read English. Each command names the
// agent (`agent`, the one drafting it), so it works as printed (P3C-R3-14).
export function handInText(id: string, agent = '<your name>'): string {
  return [
    `How to hand it in: start from the draft with otea board draft ${id} --as ${agent} > ${draftPath(id)}`,
    '(in the temp folder, so nothing is left in the repo),',
    'change it (keep the ids of what is there; give what you add new ids), then run',
    `otea board draft ${id} --file ${draftPath(id)} --as ${agent}. It says what is wrong until the board is right.`,
    `To check it before: its shape, each key with an example, is the JSON Schema ${BOARD_JSON_SCHEMA}.`,
    'Who does each step is its doer (any agent, a named agent or the person), never its text: write its instructions to whoever does it, and call the person "the person" (in Spanish, "la persona").',
    'Branches follow how the person works. For code, ask the person whether anything may reach the remote before they see it. When they work straight on main and want nothing pushed before they see it ("do not push anything I have not seen"), start from the mainline template (Code on main): each item\'s branch is main and only the step after their approval pushes it, so the gate refuses a push of main until they approve, wherever the repo has Otea\'s git hook, which Publicar offers to install (tell the person: without it, git lets a push through); never draft code on todos, which has no gate. When they work straight on main and pushes need not wait, take the guard off the branch part (or the part itself).',
    'Handing it in is your handoff: the person tries the board and publishes it in Studio, which closes this Pedido; there is no otea handoff to run.',
  ].join('\n');
}

// The board drafted on a Pedido while its draft is open: `arrived` once the agent handed one in.
// Once publishing the board closed the Pedido, `published`, with no hand-in left to give.
export type DraftRequest = {
  board: string;
  name: string;
  arrived: boolean;
  published?: true;
  instructions: string;
};

// `agent`: the agent the instructions name, else the one that holds or last held the Pedido.
export function draftRequestOf(
  ctx: Context,
  item: string,
  agent?: string,
): DraftRequest | undefined {
  for (const { id } of listBoards(ctx.db)) {
    const draft = findDraft(ctx.db, id);
    if (draft?.requestItem !== item) continue;
    return {
      board: id,
      name: readDefinition(draft.definition).name,
      arrived: draft.agentNote !== null,
      instructions: handInText(item, agent ?? findItem(ctx.db, item)?.lease?.holder),
    };
  }
  return publishedRequestOf(ctx, item);
}

// The board drafts an agent began and has not handed in yet, each with its Pedido and the agent
// that holds it now (null when none does): what a new session is pointed to (otea whoami), as one
// a restart cut off may have been drafting one.
export function openDraftsOf(
  ctx: Context,
  at: string,
): { item: string; name: string; holder: string | null }[] {
  return listBoards(ctx.db).flatMap(({ id }) => {
    const draft = findDraft(ctx.db, id);
    const item = draft?.requestItem ? findItem(ctx.db, draft.requestItem) : undefined;
    if (!draft || !item || draft.agentNote !== null || isClosed(positionOf(item.state))) return [];
    const holder = activeLease(item.lease, at)?.holder ?? null;
    return [{ item: item.id, name: readDefinition(draft.definition).name, holder }];
  });
}

// The board whose publish closed the Pedido, while that publish stands (undoing it writes
// `unpublished_board`) and the board is still live, under its name today.
function publishedRequestOf(ctx: Context, item: string): DraftRequest | undefined {
  const mark = selectEvents(ctx.db, item).findLast(
    ({ type, data }) =>
      type === 'transitioned' &&
      (typeof data.published_board === 'string' || typeof data.unpublished_board === 'string'),
  );
  const id = mark?.data.published_board;
  if (typeof id !== 'string') return undefined;
  const row = findBoard(ctx.db, id);
  const live = row?.liveVersion == null ? undefined : findVersion(ctx.db, id, row.liveVersion);
  if (!live) return undefined;
  const name = readDefinition(live.definition).name;
  return { board: id, name, arrived: true, published: true, instructions: '' };
}
