import { isListedKey, isSetKey, type Lang, TEMPLATES } from '../core/board/templates.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { addBoard, addBoardSet, type BoardRecord, listBoardSummaries } from './boards.ts';
import type { Context } from './context.ts';

// The boards `otea init --template` starts a project with, only while it has no boards of its own
// (Pedidos aside): a template set's boards or one template's board, published at once. Without a
// template, or with `none`, it makes none: the person picks them. A template is checked even when
// no board is made, so a typo always fails.

const BY: Actor = { kind: 'human', name: 'otea' };

// The project's own language (project.ts PROJECT_LANG), which imports this file.
const LANG: Lang = 'es';

// Starts the project without boards (they are made later in Studio or with otea board add).
export const NO_BOARDS = 'none';

export type InitBoard = { id: string; name: string };

export function hasOwnBoards(ctx: Context): boolean {
  return listBoardSummaries(ctx).some(({ builtin }) => !builtin);
}

export function initBoards(ctx: Context, template?: string): InitBoard[] {
  if (template !== undefined && template !== NO_BOARDS && !isListedKey(template)) {
    throw new OteaError('not_found', `There is no template ${template}`);
  }
  if (template === NO_BOARDS || hasOwnBoards(ctx)) return [];
  // A project starts with no board: the person picks the ones it uses, here or in Studio.
  if (template === undefined) return [];
  if (isSetKey(template)) {
    const made = addBoardSet(ctx, { set: template, lang: LANG, boards: [], by: BY });
    return made.map(({ record }) => named(record));
  }
  return [single(ctx, template)];
}

function single(ctx: Context, key: string): InitBoard {
  const template = TEMPLATES.find((candidate) => candidate.key === key);
  const name = template?.board[LANG] ?? key;
  return named(addBoard(ctx, { name, template: key, lang: LANG, by: BY }).record);
}

function named(record: BoardRecord): InitBoard {
  return { id: record.id, name: (record.live ?? record.draft)?.definition.name ?? '' };
}
