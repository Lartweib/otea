import { fileURLToPath } from 'node:url';
import { readDefinition } from '../core/board/schema.ts';
import { findDraft, listBoards } from '../store/boards.ts';
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
export type DraftRequest = { board: string; name: string; arrived: boolean; instructions: string };

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
  return undefined;
}
