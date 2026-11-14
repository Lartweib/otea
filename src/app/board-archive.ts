import { rmSync } from 'node:fs';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { type BoardDefinition, DONE, SAME } from '../core/board/model.ts';
import { stateName } from '../core/board/reading.ts';
import { readDefinition } from '../core/board/schema.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease } from '../core/lease.ts';
import {
  type BoardRow,
  deleteBoard,
  deleteDraft,
  findBoard,
  findDraft,
  findVersion,
  listBoards,
  setArchived,
} from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, clearLease, deleteCollection, selectItems } from '../store/queries.ts';
import { syncBoardPresets } from './boards.ts';
import type { Context } from './context.ts';
import { evidenceFile } from './evidence.ts';
import { type Clock, systemClock } from './items.ts';
import type { Project } from './project.ts';

// Archiving and deleting a board, the person's own acts in Studio (human-ui, like publishing: no
// CLI or MCP command, and the API takes them only from this computer's signed-in browser).
//
// An archived board is gone from every list (Te toca, Triaje, next, list, filters, the phone) while
// its items stay to read: nothing writes to them (board_archived) until the person restores it, and
// restoring brings everything back as it was. Open items are allowed: they freeze where they stand,
// and the leases on them are released (an agent cannot go on working an item nobody can move).
//
// A board that another divides into goes with that board: archiving, restoring and deleting the
// parent takes it along, and it is refused alone while its parent stands (the parent's items have
// their parts there). Pedidos, the built-in board, is never archived or deleted.
//
// Deleting removes the board, its versions, its draft, its collection and its items with their
// history, evidence and links; a file no other item's evidence shares goes from the data folder.
// The events of other items stay as they were written, a link to a deleted item included. Only a
// board without items, or an archived one, is deleted; with items the person types its name.

export type ArchivePlanBoard = {
  id: string;
  name: string;
  items: number;
  open: number;
  // Items an agent holds now: archiving releases them.
  held: number;
};

export type ArchivePlan = { boards: ArchivePlanBoard[] };

export type DeletePlan = {
  // `archived`: a board that stands is deleted only while it has no items.
  boards: { id: string; name: string; items: number; archived: boolean }[];
  items: number;
  // The person types the board's name to delete items with it.
  confirm: boolean;
};

export type ArchivedEntry = {
  id: string;
  title: string;
  state: string;
  stateName: string;
  // How it ended, when it has: done, or dropped (discarded, whatever its motive).
  closed: false | 'done' | 'dropped';
};

export type ArchivedBoard = {
  id: string;
  name: string;
  item: string;
  icon: string;
  collection: string;
  archivedAt: string;
  items: number;
  open: number;
  // The board it was archived with, when another divides into it.
  parent: string | null;
  // Its items, oldest first, for Studio's Archivados to show and search.
  entries: ArchivedEntry[];
};

type Who = { by: Actor };

function definitionOf(ctx: Context, row: BoardRow): BoardDefinition | undefined {
  const version =
    row.liveVersion === null ? undefined : findVersion(ctx.db, row.id, row.liveVersion);
  if (version) return readDefinition(version.definition);
  const draft = findDraft(ctx.db, row.id);
  return draft ? readDefinition(draft.definition) : undefined;
}

const nameOf = (ctx: Context, row: BoardRow) =>
  definitionOf(ctx, row)?.name ?? row.collection ?? row.id;

function requireRow(ctx: Context, id: string): BoardRow {
  const row = findBoard(ctx.db, id);
  if (!row) throw new OteaError('not_found', `There is no board ${id}`);
  return row;
}

function refuseBuiltin(ctx: Context, row: BoardRow, act: string): void {
  if (!row.builtin) return;
  const board = nameOf(ctx, row);
  throw new OteaError(
    'forbidden',
    `${board} is the project's own board for requests: it cannot be ${act}`,
    {
      kind: 'board_builtin',
      board,
    },
  );
}

// The board `row` divides into, when it is another board.
function childOf(ctx: Context, row: BoardRow): BoardRow | undefined {
  const split = definitionOf(ctx, row)?.split;
  if (!split || split.board === SAME || split.board === row.id) return undefined;
  const child = findBoard(ctx.db, split.board);
  return child && !child.builtin ? child : undefined;
}

// The board that divides into `row`, if one does.
function parentOf(ctx: Context, row: BoardRow): BoardRow | undefined {
  return listBoards(ctx.db, { archived: true }).find(
    (other) => other.id !== row.id && childOf(ctx, other)?.id === row.id,
  );
}

function refuseChild(ctx: Context, row: BoardRow, parent: BoardRow, act: string): never {
  const board = nameOf(ctx, row);
  const name = nameOf(ctx, parent);
  throw new OteaError(
    'in_use',
    `${board} is the board ${name} divides into: ${act} ${name}, and ${board} goes with it`,
    { kind: 'board_split_child', board, parent: name },
  );
}

const itemsOf = (ctx: Context, row: BoardRow) =>
  row.collection === null
    ? []
    : selectItems(ctx.db, { collection: row.collection, archived: true });

const isOpen = (state: string) => !isClosed(positionOf(state));

function group(ctx: Context, row: BoardRow): BoardRow[] {
  const child = childOf(ctx, row);
  return child ? [row, child] : [row];
}

export function archivePlan(ctx: Context, id: string, now: Clock = systemClock): ArchivePlan {
  const at = now();
  return {
    boards: group(ctx, requireRow(ctx, id)).map((row) => {
      const items = itemsOf(ctx, row);
      return {
        id: row.id,
        name: nameOf(ctx, row),
        items: items.length,
        open: items.filter(({ state }) => isOpen(state)).length,
        held: items.filter(({ lease }) => activeLease(lease, at)).length,
      };
    }),
  };
}

function refuseArchived(ctx: Context, row: BoardRow): void {
  if (row.archivedAt === null) return;
  const board = nameOf(ctx, row);
  throw new OteaError('board_archived', `${board} is already archived`, {
    kind: 'board_archived',
    board,
  });
}

export function archiveBoard(
  ctx: Context,
  id: string,
  who: Who,
  now: Clock = systemClock,
): { archived: string[] } {
  const result = transaction(ctx.db, () => {
    const row = requireRow(ctx, id);
    refuseBuiltin(ctx, row, 'archived');
    refuseArchived(ctx, row);
    if (row.collection === null || row.liveVersion === null)
      throw new OteaError(
        'invalid_board',
        `${nameOf(ctx, row)} is not published: discard its draft instead`,
      );
    const parent = parentOf(ctx, row);
    if (parent && parent.archivedAt === null) refuseChild(ctx, row, parent, 'archive');
    const at = now();
    const boards = group(ctx, row).filter((each) => each.archivedAt === null);
    for (const board of boards) {
      for (const item of itemsOf(ctx, board)) {
        if (!item.lease) continue;
        clearLease(ctx.db, item.id);
        const lease = activeLease(item.lease, at);
        if (!lease) continue;
        const data = { holder: lease.holder, cause: 'archive' };
        appendEvent(ctx.db, { itemId: item.id, type: 'released', actor: who.by, at, data });
      }
    }
    for (const board of boards) setArchived(ctx.db, board.id, at);
    return { archived: boards.map((board) => board.id) };
  });
  syncBoardPresets(ctx);
  return result;
}

export function unarchiveBoard(
  ctx: Context,
  id: string,
  _who: Who,
  _now: Clock = systemClock,
): { restored: string[] } {
  const result = transaction(ctx.db, () => {
    const row = requireRow(ctx, id);
    if (row.archivedAt === null) {
      const board = nameOf(ctx, row);
      throw new OteaError('invalid_board', `${board} is not archived`, {
        kind: 'board_not_archived',
        board,
      });
    }
    const parent = parentOf(ctx, row);
    if (parent && parent.archivedAt !== null) refuseChild(ctx, row, parent, 'restore');
    const boards = group(ctx, row).filter((each) => each.archivedAt !== null);
    for (const board of boards) setArchived(ctx.db, board.id, null);
    return { restored: boards.map((board) => board.id) };
  });
  syncBoardPresets(ctx);
  return result;
}

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function deletePlan(ctx: Context, id: string): DeletePlan {
  const boards = group(ctx, requireRow(ctx, id)).map((row) => ({
    id: row.id,
    name: nameOf(ctx, row),
    items: itemsOf(ctx, row).length,
    archived: row.archivedAt !== null,
  }));
  const items = boards.reduce((sum, board) => sum + board.items, 0);
  return { boards, items, confirm: items > 0 };
}

export function deleteBoardForever(
  project: Project,
  id: string,
  input: { confirm?: string },
): { deleted: string[] } {
  const { db } = project;
  const files = new Set<string>();
  const result = transaction(db, () => {
    const row = requireRow(project, id);
    refuseBuiltin(project, row, 'deleted');
    const parent = parentOf(project, row);
    if (parent) refuseChild(project, row, parent, 'delete');
    const boards = group(project, row);
    let total = 0;
    for (const board of boards) {
      const items = itemsOf(project, board).length;
      total += items;
      if (items > 0 && board.archivedAt === null) {
        const name = nameOf(project, board);
        throw new OteaError(
          'in_use',
          `${name} has ${items} item(s): archive it first, then delete it`,
          { kind: 'board_has_items', board: name, items },
        );
      }
    }
    const name = nameOf(project, row);
    if (total > 0 && !same(input.confirm ?? '', name))
      throw new OteaError(
        'reason_required',
        `Deleting ${name} deletes ${total} item(s): type the board's name to confirm`,
        { kind: 'board_delete_confirm', board: name, items: total },
      );
    const at = new Date().toISOString();
    for (const board of boards) {
      // Archived first, so the board's append-only rows may go (store/migrations.ts).
      setArchived(db, board.id, board.archivedAt ?? at);
      const ids = itemsOf(project, board).map((item) => item.id);
      for (const item of ids) {
        const shas = db.prepare('SELECT sha256 FROM evidence WHERE item_id = ?').all(item);
        for (const sha of shas) files.add(String(sha.sha256));
        db.prepare('DELETE FROM relations WHERE from_id = ? OR to_id = ?').run(item, item);
        db.prepare('DELETE FROM evidence WHERE item_id = ?').run(item);
        db.prepare('DELETE FROM events WHERE item_id = ?').run(item);
        db.prepare('DELETE FROM items WHERE id = ?').run(item);
      }
      deleteDraft(db, board.id);
      db.prepare('DELETE FROM board_versions WHERE board_id = ?').run(board.id);
      deleteBoard(db, board.id);
      if (board.collection !== null) deleteCollection(db, board.collection);
    }
    return { deleted: boards.map((board) => board.id) };
  });
  // A file stays while any other item's evidence names it; one left over is harmless, so a file
  // that cannot be removed now is not an error.
  for (const sha of files) {
    if (db.prepare('SELECT 1 FROM evidence WHERE sha256 = ? LIMIT 1').get(sha)) continue;
    rmSync(evidenceFile(project.dataDir, sha), { force: true });
  }
  syncBoardPresets(project);
  return result;
}

// Studio's Archivados: every archived board with its items.
export function listArchivedBoards(ctx: Context): ArchivedBoard[] {
  const rows = listBoards(ctx.db, { archived: true }).filter(
    (row) => row.archivedAt !== null && row.collection !== null,
  );
  return rows.flatMap((row) => {
    const def = definitionOf(ctx, row);
    if (!def || row.collection === null || row.archivedAt === null) return [];
    const items = itemsOf(ctx, row);
    const parent = parentOf(ctx, row);
    return [
      {
        id: row.id,
        name: def.name,
        item: def.item,
        icon: def.icon,
        collection: row.collection,
        archivedAt: row.archivedAt,
        items: items.length,
        open: items.filter(({ state }) => isOpen(state)).length,
        parent: parent?.archivedAt ? parent.id : null,
        entries: items.map((item) => ({
          id: item.id,
          title: item.title,
          state: item.state,
          stateName: stateName(def, item.state),
          closed: isOpen(item.state) ? false : item.state === DONE ? 'done' : 'dropped',
        })),
      },
    ];
  });
}
