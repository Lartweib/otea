import { fileURLToPath } from 'node:url';
import { readDefinition } from '../core/board/schema.ts';
import { findBoard, findDraft, findVersion, listBoards } from '../store/boards.ts';
import { selectEvents } from '../store/queries.ts';
import type { Context } from './context.ts';

// A Pedido an agent drafts a board on ("Que lo esboce un agente"): the board waiting on it, and how
// the agent hands its draft in. The person's words stay the Pedido's field; how to hand it in is
// the step's instructions, which the agent reads in next and show and the page shows apart.

export const DRAFT_FILENAME = 'board.json';

// The JSON Schema of board.json Otea ships, generated from the board's zod schema.
export const BOARD_JSON_SCHEMA = fileURLToPath(
  new URL('../../schemas/board.schema.json', import.meta.url),
);

// How the agent hands its draft in on the Pedido `id`: agents read English.
export function handInText(id: string): string {
  return [
    `How to hand it in: start from the draft with otea board draft ${id} > ${DRAFT_FILENAME},`,
    'change it (keep the ids of what is there; give what you add new ids), then run',
    `otea board draft ${id} --file ${DRAFT_FILENAME}. It says what is wrong until the board is right.`,
    `To check it before: its shape, each key with an example, is the JSON Schema ${BOARD_JSON_SCHEMA}.`,
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

export function draftRequestOf(ctx: Context, item: string): DraftRequest | undefined {
  for (const { id } of listBoards(ctx.db)) {
    const draft = findDraft(ctx.db, id);
    if (draft?.requestItem !== item) continue;
    return {
      board: id,
      name: readDefinition(draft.definition).name,
      arrived: draft.agentNote !== null,
      instructions: handInText(item),
    };
  }
  return publishedRequestOf(ctx, item);
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
