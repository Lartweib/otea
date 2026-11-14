import { boardText } from '../core/board/next.ts';
import { OteaError } from '../core/errors.ts';
import { listCollections } from '../store/queries.ts';
import { getCollection } from './collections.ts';
import type { ItemView } from './items.ts';
import { itemNextText, liveBoardOf } from './next.ts';
import type { Project } from './project.ts';

// What agents read about a board before acting (`otea board`): a published board's own words for
// them (core/board/next.ts boardText). And what `otea show` says to do now with an item.

// A published board: its live version and what agents read of it.
export type BoardGuide = { collection: string; board: string; version: number; text: string };

export type Guide = { kind: 'board' } & BoardGuide;

export type GuideEntry = {
  name: string;
  board: string | null;
  command: string;
};

// What `otea show` says to do now with the item: next's text on its board.
export function hintFor(project: Project, item: ItemView, me: string): string {
  if (item.archived)
    return `${item.id} is on ${item.archived.board}, an archived board: it is read-only. Pick another item with otea next.`;
  return itemNextText(project, item, me) ?? '';
}

export function guideCommand(collection: string): string {
  return /^[\w.-]+$/.test(collection) ? `otea board ${collection}` : `otea board "${collection}"`;
}

export function boardGuide(project: Project, name: string): Guide {
  const collection = getCollection(project.db, name).name;
  const board = liveBoardOf(project, collection);
  if (!board) throw new OteaError('not_found', `Board "${name}" is not published yet`);
  return {
    kind: 'board',
    collection: name,
    board: board.id,
    version: board.version,
    text: boardText(board.def),
  };
}

// The project's boards, each with how to read what its agents do.
export function guideIndex(project: Project): GuideEntry[] {
  return listCollections(project.db).map(({ name }) => ({
    name,
    board: liveBoardOf(project, name)?.id ?? null,
    command: guideCommand(name),
  }));
}
