import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  boardsStamp,
  deleteBoard,
  deleteDraft,
  findBoard,
  findBoardOfCollection,
  findDraft,
  findVersion,
  insertBoard,
  insertVersion,
  listBoards,
  listVersions,
  maxVersion,
  renameCollection,
  retireBoard,
  setBoardCollection,
  setLiveVersion,
  upsertDraft,
} from './boards.ts';
import { openDatabase, transaction } from './database.ts';
import { migrate } from './migrations.ts';

describe('board storage', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    db.exec(`
      INSERT INTO collections (name, prefix, preset, preset_version, next_seq) VALUES ('Tareas', 'TAREAS', 'b1', 1, 2);
      INSERT INTO items (id, collection, seq, title, state, created_at, updated_at, created_by_kind, created_by_name)
      VALUES ('TAREAS-1', 'Tareas', 1, 'A', 's1', 't', 't', 'human', 'ana');
    `);
  });

  afterEach(() => db.close());

  it('keeps a board, its versions and the live pointer', () => {
    insertBoard(db, { id: 'b1', createdAt: 't0', builtin: false });
    expect(findBoard(db, 'b1')).toEqual({
      id: 'b1',
      collection: null,
      liveVersion: null,
      builtin: false,
      createdAt: 't0',
      archivedAt: null,
    });
    insertVersion(db, {
      boardId: 'b1',
      version: 1,
      definition: '{"a":1}',
      publishedAt: 't1',
      publishedBy: 'ana',
    });
    insertVersion(db, {
      boardId: 'b1',
      version: 2,
      definition: '{"a":2}',
      publishedAt: 't2',
      publishedBy: 'ana',
    });
    setLiveVersion(db, 'b1', 2);
    setBoardCollection(db, 'b1', 'Tareas');
    expect(maxVersion(db, 'b1')).toBe(2);
    expect(findVersion(db, 'b1', 1)).toEqual({
      version: 1,
      definition: '{"a":1}',
      publishedAt: 't1',
      publishedBy: 'ana',
    });
    expect(listVersions(db, 'b1').map(({ version }) => version)).toEqual([1, 2]);
    expect(findBoardOfCollection(db, 'Tareas')?.id).toBe('b1');
    expect(listBoards(db).map(({ id, liveVersion }) => `${id}@${liveVersion}`)).toEqual(['b1@2']);
  });

  it('never rewrites or deletes a published version', () => {
    insertBoard(db, { id: 'b1', createdAt: 't0', builtin: false });
    insertVersion(db, {
      boardId: 'b1',
      version: 1,
      definition: '{}',
      publishedAt: 't1',
      publishedBy: 'ana',
    });
    expect(() => db.exec("UPDATE board_versions SET definition = 'x'")).toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM board_versions')).toThrow(/append-only/);
  });

  it('keeps one draft per board, replaced whole, with the agent request it waits for', () => {
    insertBoard(db, { id: 'b1', createdAt: 't0', builtin: false });
    upsertDraft(db, {
      boardId: 'b1',
      definition: '{"v":1}',
      baseVersion: null,
      updatedAt: 't1',
      requestItem: 'TAREAS-1',
      agentNote: null,
    });
    upsertDraft(db, {
      boardId: 'b1',
      definition: '{"v":2}',
      baseVersion: null,
      updatedAt: 't2',
      requestItem: 'TAREAS-1',
      agentNote: '["+ paso"]',
    });
    expect(findDraft(db, 'b1')).toEqual({
      boardId: 'b1',
      definition: '{"v":2}',
      baseVersion: null,
      updatedAt: 't2',
      requestItem: 'TAREAS-1',
      agentNote: '["+ paso"]',
    });
    deleteDraft(db, 'b1');
    expect(findDraft(db, 'b1')).toBeUndefined();
    deleteBoard(db, 'b1');
    expect(findBoard(db, 'b1')).toBeUndefined();
  });

  it('retires a board it cannot delete from every listing', () => {
    insertBoard(db, { id: 'b2', createdAt: 't0', builtin: false });
    retireBoard(db, 'b2', 't1');
    expect(listBoards(db)).toEqual([]);
    expect(findBoard(db, 'b2')?.id).toBe('b2');
  });

  it('renames a collection and everything that points at it in one go', () => {
    insertBoard(db, { id: 'b1', createdAt: 't0', builtin: false });
    setBoardCollection(db, 'b1', 'Tareas');
    transaction(db, () => renameCollection(db, 'Tareas', 'Tareas del muelle'));
    expect(findBoard(db, 'b1')?.collection).toBe('Tareas del muelle');
    expect(db.prepare('SELECT collection FROM items').get()?.collection).toBe('Tareas del muelle');
    expect(db.prepare('SELECT name FROM collections').get()?.name).toBe('Tareas del muelle');
  });

  it('changes its stamp when a board is published or restored, for long-lived readers', () => {
    const before = boardsStamp(db);
    insertBoard(db, { id: 'b1', createdAt: 't0', builtin: false });
    insertVersion(db, {
      boardId: 'b1',
      version: 1,
      definition: '{}',
      publishedAt: 't1',
      publishedBy: 'ana',
    });
    setLiveVersion(db, 'b1', 1);
    const live = boardsStamp(db);
    expect(live).not.toBe(before);
    setLiveVersion(db, 'b1', null);
    expect(boardsStamp(db)).not.toBe(live);
  });
});
