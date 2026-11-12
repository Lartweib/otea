import { type Lang, TEMPLATE_SETS, TEMPLATES } from '../core/board/templates.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import {
  addBoard,
  type BoardRecord,
  createBoardSet,
  listBoardSummaries,
  publishBoard,
} from './boards.ts';
import type { Context } from './context.ts';

// The boards `otea init` starts a project with: a template set's boards (Producto, Cambios en
// varios repos), one template's board, or, by default and only on a project with no boards of its
// own yet, Tareas simples and Clasificar errores; `none`, nothing. Each is published at once.

const BY: Actor = { kind: 'human', name: 'otea' };

// The project's own language (project.ts PROJECT_LANG), which imports this file.
const LANG: Lang = 'es';

const DEFAULTS = ['tasks', 'triage'] as const;

// Starts the project without boards (they are made later in Studio or with otea board add).
export const NO_BOARDS = 'none';

export type InitBoard = { id: string; name: string };

const own = (ctx: Context) => listBoardSummaries(ctx).filter(({ builtin }) => !builtin);

export function initBoards(ctx: Context, template?: string): InitBoard[] {
  if (template === undefined) {
    if (own(ctx).length > 0) return [];
    return DEFAULTS.map((key) => single(ctx, key));
  }
  if (template === NO_BOARDS) return [];
  if (TEMPLATE_SETS.some(({ key }) => key === template)) {
    const made = createBoardSet(ctx, { set: template, lang: LANG, boards: [] });
    // A part board is published before the board that divides into it.
    for (const record of [...made].reverse()) publishBoard(ctx, record.id, { moves: {}, by: BY });
    return made.map(named);
  }
  if (!TEMPLATES.some(({ key, hidden }) => key === template && !hidden)) {
    throw new OteaError('not_found', `There is no template ${template}`);
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
