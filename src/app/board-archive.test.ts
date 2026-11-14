import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { creatures } from '../core/board/testing.ts';
import { findBoard, listVersions } from '../store/boards.ts';
import { findCollection, listCollections, selectEvents } from '../store/queries.ts';
import {
  archiveBoard,
  archivePlan,
  deleteBoardForever,
  deletePlan,
  listArchivedBoards,
  unarchiveBoard,
} from './board-archive.ts';
import {
  createBoard,
  createBoardSet,
  ensureRequestsBoard,
  getBoardRecord,
  listBoardSummaries,
  publishBoard,
  publishPair,
  saveDraft,
} from './boards.ts';
import { evidenceFile } from './evidence.ts';
import { createItem, getItem, listItems, moveItem, showItem, updateItem } from './items.ts';
import { claimItem, heartbeatItem } from './leases.ts';
import { liveBoards, nextFor } from './next.ts';
import { leaveNote } from './notes.ts';
import type { Project } from './project.ts';
import { linkItems } from './relations.ts';
import { memoryContext, projectOf } from './testing.ts';

const you = { kind: 'human' as const, name: 'human' };
const kiln = { kind: 'agent' as const, name: 'kiln' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 14, 9, 0, tick++)).toISOString();

let root: string;
let project: Project;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'otea-archive-'));
  project = projectOf(root, memoryContext());
});

afterEach(() => {
  project.db.close();
  rmSync(root, { recursive: true, force: true });
});

// A published Criaturas board.
function criaturas(name = 'Criaturas'): string {
  const record = createBoard(project, { name, lang: 'es' }, now);
  saveDraft(project, record.id, { definition: { ...creatures(), name }, baseVersion: null }, now);
  publishBoard(project, record.id, { moves: {}, by: you }, now);
  return record.id;
}

const add = (title: string, collection = 'Criaturas') =>
  createItem(project, { collection, title, fields: { fdesc: 'x' }, actor: you }, now).id;

// Cambios, which divides into Tareas de repo, both published.
function pair(): { parent: string; child: string } {
  const [parent, child] = createBoardSet(project, { set: 'repos', lang: 'es', boards: [] }, now);
  if (!parent || !child) throw new Error('no pair');
  publishPair(
    project,
    { parent: parent.id, child: child.id, moves: { parent: {}, child: {} }, by: you },
    now,
  );
  return { parent: parent.id, child: child.id };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string; details?: unknown }).code;
  }
  return 'no error';
};

describe('archiveBoard', () => {
  it('takes the board out of every list, its items kept to read', () => {
    const board = criaturas();
    const id = add('Ciervo');
    criaturas('Plantas');

    expect(archiveBoard(project, board, { by: you }, now)).toEqual({ archived: [board] });

    expect(listBoardSummaries(project).map(({ name }) => name)).not.toContain('Criaturas');
    expect(liveBoards(project).map(({ collection }) => collection)).toEqual(['Plantas']);
    expect(listCollections(project.db).map(({ name }) => name)).not.toContain('Criaturas');
    expect(listItems(project).map((item) => item.id)).not.toContain(id);
    expect(nextFor(project, 'kiln', {}, now).item).toBeNull();

    expect(getItem(project, id, now).title).toBe('Ciervo');
    expect(showItem(project, id, { actor: you, channel: 'ui' }, now).archived).toEqual({
      board: 'Criaturas',
    });
    expect(listArchivedBoards(project)).toEqual([
      expect.objectContaining({
        id: board,
        name: 'Criaturas',
        items: 1,
        open: 1,
        entries: [expect.objectContaining({ id, title: 'Ciervo', closed: false })],
      }),
    ]);
  });

  it('freezes its items: agents and the person get board_archived, nothing is written', () => {
    const board = criaturas();
    const id = add('Ciervo');
    archiveBoard(project, board, { by: you }, now);
    const events = selectEvents(project.db, id).length;

    expect(code(() => claimItem(project, { id, actor: kiln }, now))).toBe('board_archived');
    expect(code(() => moveItem(project, { id, to: 'done', actor: you, channel: 'ui' }, now))).toBe(
      'board_archived',
    );
    expect(code(() => updateItem(project, { id, title: 'Otro', actor: kiln }, now))).toBe(
      'board_archived',
    );
    expect(
      code(() => leaveNote(project, { id, text: 'Mira', actor: you, channel: 'ui' }, now)),
    ).toBe('board_archived');
    expect(code(() => add('Nuevo'))).toBe('board_archived');
    expect(selectEvents(project.db, id)).toHaveLength(events);
  });

  it('says which board in the refusal, for the CLI and the UI', () => {
    const board = criaturas();
    const id = add('Ciervo');
    archiveBoard(project, board, { by: you }, now);

    expect(() => claimItem(project, { id, actor: kiln }, now)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Criaturas, an archived board'),
        details: { kind: 'board_archived', item: id, board: 'Criaturas' },
      }),
    );
  });

  it('releases the leases on its items, saying so in their history', () => {
    const board = criaturas();
    const id = add('Ciervo');
    claimItem(project, { id, actor: kiln }, now);

    expect(archivePlan(project, board, now)).toEqual({
      boards: [{ id: board, name: 'Criaturas', items: 1, open: 1, held: 1 }],
    });
    archiveBoard(project, board, { by: you }, now);

    expect(getItem(project, id, now).lease).toBeNull();
    expect(selectEvents(project.db, id).at(-1)).toMatchObject({
      type: 'released',
      actor: you,
      data: { holder: 'kiln', cause: 'archive' },
    });
    expect(code(() => heartbeatItem(project, { id, actor: kiln }, now))).toBe('board_archived');
  });

  it('keeps its name taken: a new board cannot take it while it is archived', () => {
    const board = criaturas();
    archiveBoard(project, board, { by: you }, now);

    expect(code(() => createBoard(project, { name: 'criaturas', lang: 'es' }, now))).toBe(
      'already_exists',
    );
  });

  it('refuses Studio changes to an archived board', () => {
    const board = criaturas();
    archiveBoard(project, board, { by: you }, now);

    expect(
      code(() => saveDraft(project, board, { definition: creatures(), baseVersion: 1 }, now)),
    ).toBe('board_archived');
    expect(code(() => archiveBoard(project, board, { by: you }, now))).toBe('board_archived');
  });

  it('refuses Pedidos and a board never published', () => {
    const requests = ensureRequestsBoard(project, 'es', now);
    const draft = createBoard(project, { name: 'Borrador', lang: 'es' }, now);

    expect(code(() => archiveBoard(project, requests, { by: you }, now))).toBe('forbidden');
    expect(code(() => archiveBoard(project, draft.id, { by: you }, now))).toBe('invalid_board');
  });

  it('archives the board a parent divides into with it, and refuses that board alone', () => {
    const { parent, child } = pair();

    expect(code(() => archiveBoard(project, child, { by: you }, now))).toBe('in_use');
    expect(archivePlan(project, parent).boards.map(({ name }) => name)).toEqual([
      'Cambios',
      'Tareas de repo',
    ]);
    expect(archiveBoard(project, parent, { by: you }, now)).toEqual({
      archived: [parent, child],
    });
    expect(listBoardSummaries(project).map(({ name }) => name)).toEqual([]);
    expect(code(() => unarchiveBoard(project, child, { by: you }, now))).toBe('in_use');
    expect(unarchiveBoard(project, parent, { by: you }, now)).toEqual({
      restored: [parent, child],
    });
    expect(
      listBoardSummaries(project)
        .map(({ name }) => name)
        .sort(),
    ).toEqual(['Cambios', 'Tareas de repo']);
  });
});

describe('unarchiveBoard', () => {
  it('brings everything back as it was: in the lists, and writable', () => {
    const board = criaturas();
    const id = add('Ciervo');
    const before = getItem(project, id, now);
    archiveBoard(project, board, { by: you }, now);

    unarchiveBoard(project, board, { by: you }, now);

    expect(listBoardSummaries(project).map(({ name }) => name)).toEqual(['Criaturas']);
    expect(listItems(project).map((item) => item.id)).toEqual([id]);
    expect(getItem(project, id, now).state).toBe(before.state);
    expect(listArchivedBoards(project)).toEqual([]);
    expect(claimItem(project, { id, actor: kiln }, now).lease?.holder).toBe('kiln');
  });

  it('refuses a board that is not archived', () => {
    const board = criaturas();
    expect(code(() => unarchiveBoard(project, board, { by: you }, now))).toBe('invalid_board');
  });
});

describe('deleteBoardForever', () => {
  it('deletes a board without items at once, its versions and collection with it', () => {
    const board = criaturas();

    expect(deletePlan(project, board)).toEqual({
      boards: [{ id: board, name: 'Criaturas', items: 0, archived: false }],
      items: 0,
      confirm: false,
    });
    expect(deleteBoardForever(project, board, {})).toEqual({ deleted: [board] });

    expect(findBoard(project.db, board)).toBeUndefined();
    expect(listVersions(project.db, board)).toEqual([]);
    expect(findCollection(project.db, 'Criaturas')).toBeUndefined();
  });

  it('refuses a board that stands with items, and Pedidos', () => {
    const board = criaturas();
    add('Ciervo');
    const requests = ensureRequestsBoard(project, 'es', now);

    expect(code(() => deleteBoardForever(project, board, { confirm: 'Criaturas' }))).toBe('in_use');
    expect(code(() => deleteBoardForever(project, requests, {}))).toBe('forbidden');
  });

  it('deletes an archived board with its items, their history and files, once its name is typed', () => {
    const board = criaturas();
    const id = add('Ciervo');
    criaturas('Plantas');
    const other = add('Rosa', 'Plantas');
    linkItems(project, { id: other, kind: 'relates', other: id, actor: you, channel: 'ui' }, now);
    const dir = join(project.dataDir, 'evidence');
    mkdirSync(dir, { recursive: true });
    const evidence = (item: string, sha: string) => {
      writeFileSync(evidenceFile(project.dataDir, sha), 'x');
      project.db
        .prepare(
          `INSERT INTO evidence (item_id, role, kind, filename, content_type, size, sha256,
            created_at, actor_kind, actor_name, channel)
           VALUES (?, 'result', 'image', 'a.png', 'image/png', 1, ?, 't', 'agent', 'kiln', 'cli')`,
        )
        .run(item, sha);
    };
    evidence(id, 'only');
    evidence(id, 'shared');
    evidence(other, 'shared');
    archiveBoard(project, board, { by: you }, now);
    const otherEvents = selectEvents(project.db, other).length;

    expect(deletePlan(project, board)).toMatchObject({ items: 1, confirm: true });
    expect(code(() => deleteBoardForever(project, board, {}))).toBe('reason_required');
    expect(code(() => deleteBoardForever(project, board, { confirm: 'Plantas' }))).toBe(
      'reason_required',
    );
    deleteBoardForever(project, board, { confirm: ' criaturas ' });

    expect(findBoard(project.db, board)).toBeUndefined();
    expect(findCollection(project.db, 'Criaturas')).toBeUndefined();
    expect(project.db.prepare('SELECT count(*) AS n FROM items WHERE id = ?').get(id)?.n).toBe(0);
    expect(
      project.db.prepare('SELECT count(*) AS n FROM events WHERE item_id = ?').get(id)?.n,
    ).toBe(0);
    expect(project.db.prepare('SELECT count(*) AS n FROM relations').get()?.n).toBe(0);
    expect(existsSync(evidenceFile(project.dataDir, 'only'))).toBe(false);
    expect(existsSync(evidenceFile(project.dataDir, 'shared'))).toBe(true);
    // What happened on the other board stays in its history, the link to the deleted item too.
    expect(selectEvents(project.db, other)).toHaveLength(otherEvents);
    expect(listArchivedBoards(project)).toEqual([]);
  });

  it('deletes the board a parent divides into with it, and refuses that board alone', () => {
    const { parent, child } = pair();
    archiveBoard(project, parent, { by: you }, now);

    expect(code(() => deleteBoardForever(project, child, {}))).toBe('in_use');
    expect(deletePlan(project, parent).boards.map(({ name }) => name)).toEqual([
      'Cambios',
      'Tareas de repo',
    ]);
    expect(deleteBoardForever(project, parent, {})).toEqual({ deleted: [parent, child] });
    expect(getBoardRecordOrNull(parent)).toBeNull();
    expect(getBoardRecordOrNull(child)).toBeNull();
  });
});

function getBoardRecordOrNull(id: string) {
  try {
    return getBoardRecord(project, id);
  } catch {
    return null;
  }
}
