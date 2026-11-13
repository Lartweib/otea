import { compileBoard } from '../core/board/compile.ts';
import { isClosed, positionOf, stateOf } from '../core/board/engine.ts';
import { type IdSource, newId } from '../core/board/ids.ts';
import { type BoardDefinition, DONE, isAgent, type Target } from '../core/board/model.ts';
import {
  type Change,
  changePlan,
  type ItemEffects,
  type ItemState,
  itemEffects,
  itemMoves,
} from '../core/board/plan.ts';
import { type BoardRef, blocking, type Problem, problemsOf } from '../core/board/problems.ts';
import { parseDefinition, readDefinition } from '../core/board/schema.ts';
import {
  blankBoard,
  boardLang,
  instantiate,
  instantiateSet,
  type Lang,
  listedTemplates,
  requestsBoard,
  TEMPLATE_SETS,
  TEMPLATES,
  type TemplateView,
} from '../core/board/templates.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import {
  type BoardRow,
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
} from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  clearLease,
  collectionTaken,
  deleteCollection,
  findItem,
  insertCollection,
  listCollections,
  selectAgents,
  selectItems,
  setCollectionPreset,
  updateItemState,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Clock, systemClock } from './items.ts';
import { linksOf } from './next.ts';
import type { LoadedPreset, PresetCatalog } from './presets.ts';

// Boards with versions, as Studio makes them: a draft per board, published as a new version in one
// transaction (its collection, item moves and events), restorable, and compiled into the preset
// catalog the rest of Otea reads (core/board/compile.ts). Names are free text; ids are hidden.

export type BoardVersionInfo = { version: number; publishedAt: string; publishedBy: string };

export type BoardRecord = {
  id: string;
  collection: string | null;
  builtin: boolean;
  live: (BoardVersionInfo & { definition: BoardDefinition }) | null;
  draft: {
    definition: BoardDefinition;
    baseVersion: number | null;
    updatedAt: string;
    // The Pedido an agent drafts this board on, and what it added once its draft arrived.
    requestItem: string | null;
    agentNote: string[] | null;
  } | null;
  versions: BoardVersionInfo[];
};

// draft: never published; live: published, no changes; changed: published with a draft; waiting:
// an agent is drafting it.
export type BoardStatus = 'draft' | 'live' | 'changed' | 'waiting';

export type BoardSummary = {
  id: string;
  name: string;
  item: string;
  icon: string;
  builtin: boolean;
  status: BoardStatus;
  liveVersion: number | null;
  collection: string | null;
  // Open items on the live board.
  open: number;
  requestItem: string | null;
  // The definition the home draws the small route from: the draft, or else the live version.
  definition: BoardDefinition;
};

function versionInfo(row: { version: number; publishedAt: string; publishedBy: string }) {
  return { version: row.version, publishedAt: row.publishedAt, publishedBy: row.publishedBy };
}

function recordOf(ctx: Context, row: BoardRow): BoardRecord {
  const live = row.liveVersion === null ? undefined : findVersion(ctx.db, row.id, row.liveVersion);
  const draft = findDraft(ctx.db, row.id);
  return {
    id: row.id,
    collection: row.collection,
    builtin: row.builtin,
    live: live ? { ...versionInfo(live), definition: readDefinition(live.definition) } : null,
    draft: draft
      ? {
          definition: readDefinition(draft.definition),
          baseVersion: draft.baseVersion,
          updatedAt: draft.updatedAt,
          requestItem: draft.requestItem,
          agentNote: draft.agentNote === null ? null : (JSON.parse(draft.agentNote) as string[]),
        }
      : null,
    versions: listVersions(ctx.db, row.id).map(versionInfo),
  };
}

function requireRow(ctx: Context, id: string): BoardRow {
  const row = findBoard(ctx.db, id);
  if (!row) throw new OteaError('not_found', `There is no board ${id}`);
  return row;
}

export function getBoardRecord(ctx: Context, id: string): BoardRecord {
  return recordOf(ctx, requireRow(ctx, id));
}

function openCount(ctx: Context, collection: string | null): number {
  if (collection === null) return 0;
  return selectItems(ctx.db, { collection }).filter(({ state }) => !isClosed(positionOf(state)))
    .length;
}

function statusOf(record: BoardRecord): BoardStatus {
  if (record.draft?.requestItem && record.draft.agentNote === null) return 'waiting';
  if (!record.live) return 'draft';
  return record.draft ? 'changed' : 'live';
}

export function listBoardSummaries(ctx: Context): BoardSummary[] {
  return listBoards(ctx.db).map((row) => {
    const record = recordOf(ctx, row);
    const definition = (record.draft ?? record.live)?.definition;
    if (!definition)
      throw new OteaError('not_found', `Board ${row.id} has neither draft nor version`);
    return {
      id: row.id,
      name: definition.name,
      item: definition.item,
      icon: definition.icon,
      builtin: row.builtin,
      status: statusOf(record),
      liveVersion: record.live?.version ?? null,
      collection: row.collection,
      open: openCount(ctx, row.collection),
      requestItem: record.draft?.requestItem ?? null,
      definition,
    };
  });
}

// Every board name in the project but `except`'s, live and draft, plus collections not on a board.
function namesTaken(ctx: Context, except?: string): string[] {
  const names = listBoards(ctx.db)
    .filter(({ id }) => id !== except)
    .flatMap((row) => {
      const record = recordOf(ctx, row);
      return [record.live?.definition.name, record.draft?.definition.name].filter(
        (name): name is string => name !== undefined,
      );
    });
  const loose = listCollections(ctx.db)
    .filter(({ name }) => !findBoardOfCollection(ctx.db, name))
    .map(({ name }) => name);
  return [...names, ...loose];
}

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

function agentsOf(ctx: Context): { name: string; connected: boolean }[] {
  return selectAgents(ctx.db).map(({ name }) => ({ name, connected: true }));
}

// Every board as a split reads it, by its draft (the person's latest words) or its live version;
// `as` stands in for board `id`'s own definition.
export function boardRefs(ctx: Context, id?: string, as?: BoardDefinition): BoardRef[] {
  return listBoards(ctx.db).flatMap((row) => {
    const record = recordOf(ctx, row);
    const definition = row.id === id && as ? as : (record.draft ?? record.live)?.definition;
    if (!definition) return [];
    return [
      {
        id: row.id,
        name: definition.name,
        ...(definition.split ? { split: definition.split } : {}),
      },
    ];
  });
}

export function boardProblems(ctx: Context, id: string, definition: BoardDefinition): Problem[] {
  return problemsOf(definition, {
    agents: agentsOf(ctx),
    takenNames: namesTaken(ctx, id),
    id,
    boards: boardRefs(ctx, id, definition),
  });
}

export type CreateBoardInput = {
  name: string;
  item?: string;
  // A template key; without one the board starts blank.
  template?: string;
  lang: Lang;
  // The Pedido an agent drafts the board on.
  requestItem?: string;
};

export function createBoard(
  ctx: Context,
  input: CreateBoardInput,
  now: Clock = systemClock,
  ids: IdSource = newId,
): BoardRecord {
  return transaction(ctx.db, () => insertNewBoard(ctx, input, now, ids));
}

// Creates the board inside the caller's transaction, so it can go with what asked for it.
export function insertNewBoard(
  ctx: Context,
  input: CreateBoardInput,
  now: Clock = systemClock,
  ids: IdSource = newId,
): BoardRecord {
  const name = input.name.trim();
  if (name === '')
    throw new OteaError('invalid_name', 'A board needs a name', { kind: 'board_name_empty' });
  {
    if (namesTaken(ctx).some((taken) => same(taken, name)))
      throw new OteaError('already_exists', `There is already a board called ${name}`, {
        kind: 'board_name_taken',
        name,
      });
    const names = { name, ...(input.item?.trim() ? { item: input.item.trim() } : {}) };
    let definition: BoardDefinition;
    if (input.template !== undefined) {
      // A board that only comes in a set is never offered on its own.
      const template = TEMPLATES.find(({ key, hidden }) => key === input.template && !hidden);
      if (!template) throw new OteaError('not_found', `There is no template ${input.template}`);
      definition = instantiate(template, input.lang, names, ids);
    } else {
      definition = blankBoard(input.lang, names, ids);
    }
    const id = ids('b');
    const at = now();
    insertBoard(ctx.db, { id, createdAt: at, builtin: false });
    upsertDraft(ctx.db, {
      boardId: id,
      definition: JSON.stringify(definition),
      baseVersion: null,
      updatedAt: at,
      requestItem: input.requestItem ?? null,
      agentNote: null,
    });
    return getBoardRecord(ctx, id);
  }
}

// `draftStamp`: the draft's updatedAt as the writer last read it (null: it read no draft). When
// given, a draft written since (an agent's arriving, another tab) refuses the write instead of
// being lost under it.
export type SaveDraftInput = {
  definition: unknown;
  baseVersion: number | null;
  draftStamp?: string | null;
};

function assertDraftUnchanged(ctx: Context, id: string, stamp: string | null | undefined): void {
  if (stamp === undefined) return;
  const current = findDraft(ctx.db, id)?.updatedAt ?? null;
  if (current !== stamp)
    throw new OteaError(
      'board_conflict',
      'The draft changed since you opened it (an agent handed in its board, or another window saved it): reload to see it',
      { kind: 'draft_changed' },
    );
}

// Writes the whole draft. `baseVersion` is the live version the editor started from: when another
// publish happened since, the write is refused, so nobody publishes over changes they never saw.
export function saveDraft(
  ctx: Context,
  id: string,
  input: SaveDraftInput,
  now: Clock = systemClock,
  agentNote?: string[],
): { record: BoardRecord; problems: Problem[] } {
  const reading = parseDefinition(input.definition);
  if (!reading.ok)
    throw new OteaError(
      'invalid_board',
      `The draft is not a board: ${reading.problems.join('; ')}`,
      { kind: 'draft_invalid' },
    );
  return transaction(ctx.db, () => {
    const row = requireRow(ctx, id);
    if (row.liveVersion !== input.baseVersion)
      throw new OteaError(
        'board_conflict',
        `The board changed since this draft started: it is at version ${row.liveVersion ?? 'none'} now`,
        { kind: 'board_changed', version: row.liveVersion },
      );
    assertDraftUnchanged(ctx, id, input.draftStamp);
    const previous = findDraft(ctx.db, id);
    upsertDraft(ctx.db, {
      boardId: id,
      definition: JSON.stringify(reading.definition),
      baseVersion: input.baseVersion,
      updatedAt: now(),
      requestItem: previous?.requestItem ?? null,
      agentNote: agentNote ? JSON.stringify(agentNote) : (previous?.agentNote ?? null),
    });
    return {
      record: getBoardRecord(ctx, id),
      problems: boardProblems(ctx, id, reading.definition),
    };
  });
}

// Discards the draft; a board that was never published goes with it.
export function discardDraft(
  ctx: Context,
  id: string,
  now: Clock = systemClock,
): { deleted: boolean } {
  return transaction(ctx.db, () => {
    const row = requireRow(ctx, id);
    deleteDraft(ctx.db, id);
    if (row.liveVersion === null) {
      if (maxVersion(ctx.db, id) === 0) deleteBoard(ctx.db, id);
      else retireBoard(ctx.db, id, now());
      return { deleted: true };
    }
    return { deleted: false };
  });
}

export type PublishPlan = {
  from: number | null;
  to: number;
  changes: Change[];
  effects: ItemEffects;
  problems: Problem[];
  // The open Pedido an agent drafted the board on: publishing offers to close it.
  request: { id: string; title: string } | null;
};

function requireDraft(ctx: Context, id: string): NonNullable<BoardRecord['draft']> {
  const draft = getBoardRecord(ctx, id).draft;
  if (!draft) throw new OteaError('not_found', 'The board has no draft to publish');
  return draft;
}

// Where each item of the board stands, with how many of its parts and its blockers are open (what
// a step that starts waiting for them would hold).
function itemStates(ctx: Context, collection: string | null): ItemState[] {
  if (collection === null) return [];
  return selectItems(ctx.db, { collection }).map(({ id, state }) => {
    const { parts, blockers } = linksOf(ctx, id);
    const open = (linked: readonly { closed: boolean }[]) =>
      linked.filter(({ closed }) => !closed).length;
    return { id, state, openParts: open(parts), openBlockers: open(blockers) };
  });
}

export function publishPlan(ctx: Context, id: string): PublishPlan {
  const record = getBoardRecord(ctx, id);
  const { definition: draft, requestItem } = requireDraft(ctx, id);
  const live = record.live?.definition ?? null;
  const items = itemStates(ctx, record.collection);
  return {
    from: record.live?.version ?? null,
    to: maxVersion(ctx.db, id) + 1,
    changes: changePlan(live, draft, {
      boardName: (other) => boardRefs(ctx, id, draft).find((ref) => ref.id === other)?.name,
    }),
    effects: live
      ? itemEffects(live, draft, items)
      : { moves: [], needs: [], reopened: [], waiting: [], frozen: [] },
    problems: boardProblems(ctx, id, draft),
    request: openRequest(ctx, requestItem),
  };
}

// The Pedido a draft was asked on, while it is open.
function openRequest(ctx: Context, id: string | null): { id: string; title: string } | null {
  const item = id === null ? undefined : findItem(ctx.db, id);
  if (!item || isClosed(positionOf(item.state))) return null;
  return { id: item.id, title: item.title };
}

// What closing the Pedido on publish says, in the board's language.
const REQUEST_CLOSED: Readonly<Record<Lang, (name: string) => string>> = {
  en: (name) => `Published the board ${name}`,
  es: (name) => `Publicado el tablero ${name}`,
};

// A prefix for a new board's item ids: the first letters of what each item is called.
export function prefixOf(ctx: Context, item: string, name: string): string {
  const letters = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  const base = (letters(item) || letters(name) || 'ITM').slice(0, 3);
  for (let n = 1; ; n++) {
    const prefix = n === 1 ? base : `${base}${n}`;
    if (!collectionTaken(ctx.db, '\u0000', prefix)) return prefix;
  }
}

// `draftStamp`: the draft the plan was shown for; a draft changed since refuses the publish.
export type PublishInput = {
  moves: Readonly<Record<string, Target>>;
  by: Actor;
  draftStamp?: string | null;
  // Closes, as done, the open Pedido an agent drafted the board on: publishing is the person
  // taking the draft.
  closeRequest?: boolean;
};

export type PublishResult = {
  version: number;
  moved: { id: string; from: string; to: string }[];
  record: BoardRecord;
};

function moveItems(
  ctx: Context,
  moves: readonly { id: string; from: string; to: string }[],
  by: Actor,
  at: string,
  data: Record<string, unknown>,
) {
  const held = new Map(
    itemsWithLease(
      ctx,
      moves.map(({ id }) => id),
    ).map(({ id, holder }) => [id, holder]),
  );
  for (const move of moves) {
    updateItemState(ctx.db, move.id, move.to, at);
    appendEvent(ctx.db, {
      itemId: move.id,
      type: 'transitioned',
      actor: by,
      at,
      data: { from: move.from, to: move.to, channel: 'ui', ...data },
    });
    // The agent holding it was working on the step it left: the lease goes with that work.
    const holder = held.get(move.id);
    if (holder !== undefined) {
      clearLease(ctx.db, move.id);
      appendEvent(ctx.db, {
        itemId: move.id,
        type: 'released',
        actor: by,
        at,
        data: { holder, cause: String(data.reason ?? 'publish') },
      });
    }
  }
}

function itemsWithLease(ctx: Context, ids: readonly string[]): { id: string; holder: string }[] {
  if (ids.length === 0) return [];
  const rows = ctx.db
    .prepare(
      `SELECT id, lease_holder AS holder FROM items
       WHERE lease_holder IS NOT NULL AND id IN (${ids.map(() => '?').join(', ')})`,
    )
    .all(...ids);
  return rows.map((row) => ({ id: String(row.id), holder: String(row.holder) }));
}

// Publishes the draft as the next version, in one transaction: the board's collection (created on
// a first publish, renamed with the board), the version, the item moves and their events.
export function publishBoard(
  ctx: Context,
  id: string,
  input: PublishInput,
  now: Clock = systemClock,
): PublishResult {
  const result = transaction(ctx.db, () => publishWithin(ctx, id, input, now));
  syncBoardPresets(ctx);
  return result;
}

// The body of a publish, inside a transaction the caller holds.
function publishWithin(ctx: Context, id: string, input: PublishInput, now: Clock): PublishResult {
  const row = requireRow(ctx, id);
  const record = recordOf(ctx, row);
  assertDraftUnchanged(ctx, id, input.draftStamp);
  const { definition: draft, requestItem } = requireDraft(ctx, id);
  const problems = boardProblems(ctx, id, draft);
  if (blocking(problems)) {
    const codes = problems.filter(({ level }) => level === 'error').map(({ code }) => code);
    throw new OteaError('not_publishable', `The draft has errors: ${codes.join(', ')}`, {
      kind: 'draft_errors',
      codes,
    });
  }
  const version = maxVersion(ctx.db, id) + 1;
  compileBoard(id, version, draft);
  const at = now();
  const live = record.live?.definition ?? null;
  let moved: PublishResult['moved'] = [];
  if (live && row.collection !== null) {
    const plan = itemMoves(live, draft, itemStates(ctx, row.collection), input.moves);
    if (!plan.ok)
      throw new OteaError('invalid_board', `Items of ${plan.step} need a step that exists`);
    moved = plan.moves;
  }
  insertVersion(ctx.db, {
    boardId: id,
    version,
    definition: JSON.stringify(draft),
    publishedAt: at,
    publishedBy: input.by.name,
  });
  setLiveVersion(ctx.db, id, version);
  let collection = row.collection;
  if (collection === null) {
    collection = draft.name.trim();
    insertCollection(ctx.db, {
      name: collection,
      prefix: prefixOf(ctx, draft.item, draft.name),
      preset: id,
      presetVersion: version,
      nextSeq: 1,
      icon: null,
    });
    setBoardCollection(ctx.db, id, collection);
  } else if (collection !== draft.name.trim()) {
    renameCollection(ctx.db, collection, draft.name.trim());
    collection = draft.name.trim();
  }
  setCollectionPreset(ctx.db, collection, id, version);
  moveItems(ctx, moved, input.by, at, { reason: 'publish', board_version: version });
  const request = input.closeRequest ? openRequest(ctx, requestItem) : null;
  const from = request ? findItem(ctx.db, request.id)?.state : undefined;
  if (request && from !== undefined) {
    const reason = REQUEST_CLOSED[boardLang(draft)](draft.name.trim());
    moveItems(ctx, [{ id: request.id, from, to: DONE }], input.by, at, { reason });
  }
  deleteDraft(ctx.db, id);
  return { version, moved, record: getBoardRecord(ctx, id) };
}

export type RestoreInput = { version: number | null; by: Actor };

// Undoes a publish: `version` (the one before, or null to undo a first publish) is live again, the
// items the undone publish moved go back where they were, and the undone version's changes return
// to the draft.
export function restoreBoard(
  ctx: Context,
  id: string,
  input: RestoreInput,
  now: Clock = systemClock,
): BoardRecord {
  const result = transaction(ctx.db, () => restoreWithin(ctx, id, input, now));
  syncBoardPresets(ctx);
  return result;
}

// The body of a restore, inside a transaction the caller holds.
function restoreWithin(ctx: Context, id: string, input: RestoreInput, now: Clock): BoardRecord {
  const row = requireRow(ctx, id);
  if (row.liveVersion === null) throw new OteaError('not_undoable', 'The board is not published');
  const undone = findVersion(ctx.db, id, row.liveVersion);
  if (!undone) throw new OteaError('not_found', `Board ${id} lost version ${row.liveVersion}`);
  if (input.version !== null && !findVersion(ctx.db, id, input.version))
    throw new OteaError('not_found', `Board ${id} has no version ${input.version}`);
  const at = now();
  const collection = row.collection;
  if (input.version === null) {
    if (collection !== null && selectItems(ctx.db, { collection }).length > 0)
      throw new OteaError(
        'not_undoable',
        'Items were created on the board since it was published',
        { kind: 'restore_used' },
      );
    setLiveVersion(ctx.db, id, null);
    if (collection !== null) {
      ctx.db.prepare('UPDATE boards SET collection = NULL WHERE id = ?').run(id);
      deleteCollection(ctx.db, collection);
    }
  } else {
    const version = input.version;
    const back = readDefinition(findVersion(ctx.db, id, version)?.definition ?? '{}');
    const name = back.name.trim();
    if (collection !== null && !same(collection, name)) {
      if (namesTaken(ctx, id).some((taken) => same(taken, name)))
        throw new OteaError(
          'already_exists',
          `Another board is called ${name} now: rename it before you undo this`,
          { kind: 'restore_name_taken', name },
        );
    }
    if (collection !== null) {
      const states = new Map(
        itemStates(ctx, collection).map(({ id: item, state }) => [item, state]),
      );
      const moves = publishMoves(ctx, collection, row.liveVersion)
        .filter((move) => states.get(move.id) === move.to)
        .map(({ id: item, from, to }) => ({ id: item, from: to, to: from }));
      for (const move of moves) states.set(move.id, move.to);
      // Every open item must stand somewhere the restored version has, or it would be stuck.
      const undoneDef = readDefinition(undone.definition);
      const known = compiledStates(back);
      for (const [item, state] of states) {
        const position = positionOf(state);
        if (isClosed(position) || known.has(state)) continue;
        const step = undoneDef.steps.find((s) => s.id === position.step);
        throw new OteaError(
          'not_undoable',
          `${item} stands in ${step?.name ?? position.step}, which version ${version} does not have`,
          { kind: 'restore_step_lost', item, step: step?.name ?? position.step, version },
        );
      }
      setLiveVersion(ctx.db, id, version);
      if (collection !== name) renameCollection(ctx.db, collection, name);
      setCollectionPreset(ctx.db, name, id, version);
      moveItems(ctx, moves, input.by, at, { reason: 'restore', board_version: version });
    } else {
      setLiveVersion(ctx.db, id, version);
    }
  }
  // A draft written since the publish is the person's newer work: it stays, on the restored base.
  const kept = findDraft(ctx.db, id);
  upsertDraft(ctx.db, {
    boardId: id,
    definition: kept?.definition ?? undone.definition,
    baseVersion: input.version,
    updatedAt: at,
    requestItem: kept?.requestItem ?? null,
    agentNote: kept?.agentNote ?? null,
  });
  return getBoardRecord(ctx, id);
}

// A board that "se divide en" another board and that board, published or undone as one: the
// joined workspace's Publicar and its Deshacer. A role is acted on when the request names it.
export type PairRoles<T> = { parent?: T; child?: T };

export type PublishPairInput = {
  parent: string;
  child: string;
  moves: PairRoles<Readonly<Record<string, Target>>>;
  draftStamps?: PairRoles<string | null>;
  by: Actor;
};

export type PublishPairResult = { parent: PublishResult | null; child: PublishResult | null };

function assertPair(ctx: Context, parent: string, child: string): void {
  const record = getBoardRecord(ctx, parent);
  requireRow(ctx, child);
  const split = (record.draft ?? record.live)?.definition.split;
  if (split?.board !== child)
    throw new OteaError('invalid_board', `Board ${parent} is not split into board ${child}`);
}

function stamped(input: PublishPairInput, role: 'parent' | 'child', moves: PublishInput['moves']) {
  const stamp = input.draftStamps?.[role];
  return { moves, by: input.by, ...(stamp === undefined ? {} : { draftStamp: stamp }) };
}

// Publishes the pair's drafts in one transaction, the child first so the parent's split names a
// live board: both, or (when only one has changes) the one named, or nothing at all.
export function publishPair(
  ctx: Context,
  input: PublishPairInput,
  now: Clock = systemClock,
): PublishPairResult {
  const { parent: parentMoves, child: childMoves } = input.moves;
  if (!parentMoves && !childMoves)
    throw new OteaError('invalid_board', 'Name the boards to publish: nothing was asked for');
  const result = transaction(ctx.db, () => {
    assertPair(ctx, input.parent, input.child);
    const child = childMoves
      ? publishWithin(ctx, input.child, stamped(input, 'child', childMoves), now)
      : null;
    const parent = parentMoves
      ? publishWithin(ctx, input.parent, stamped(input, 'parent', parentMoves), now)
      : null;
    return { parent, child };
  });
  syncBoardPresets(ctx);
  // The parent's record was read before the child's publish finished: read both again.
  return {
    parent: result.parent && { ...result.parent, record: getBoardRecord(ctx, input.parent) },
    child: result.child && { ...result.child, record: getBoardRecord(ctx, input.child) },
  };
}

export type RestorePairInput = {
  parent: string;
  child: string;
  versions: PairRoles<number | null>;
  by: Actor;
};

export type RestorePairResult = { parent: BoardRecord | null; child: BoardRecord | null };

// Undoes a joint publish in one transaction, the parent first (it names the child): both boards
// go back, or neither does.
export function restorePair(
  ctx: Context,
  input: RestorePairInput,
  now: Clock = systemClock,
): RestorePairResult {
  const { parent: parentVersion, child: childVersion } = input.versions;
  if (parentVersion === undefined && childVersion === undefined)
    throw new OteaError('invalid_board', 'Name the boards to restore: nothing was asked for');
  transaction(ctx.db, () => {
    assertPair(ctx, input.parent, input.child);
    if (parentVersion !== undefined)
      restoreWithin(ctx, input.parent, { version: parentVersion, by: input.by }, now);
    if (childVersion !== undefined)
      restoreWithin(ctx, input.child, { version: childVersion, by: input.by }, now);
  });
  syncBoardPresets(ctx);
  return {
    parent: parentVersion === undefined ? null : getBoardRecord(ctx, input.parent),
    child: childVersion === undefined ? null : getBoardRecord(ctx, input.child),
  };
}

// The states a version's compiled workflow has for its steps (compile.ts phasesOf).
function compiledStates(def: BoardDefinition): Set<string> {
  return new Set(
    def.steps.flatMap((step) => {
      const doing = stateOf({ step: step.id, phase: 'doing' });
      if (step.reviewer === 'none') return [doing];
      const review = stateOf({ step: step.id, phase: 'review' });
      if (!isAgent(step.reviewer)) return [doing, review];
      return [doing, review, stateOf({ step: step.id, phase: 'yours' })];
    }),
  );
}

// The moves a publish made, read back from its events.
function publishMoves(ctx: Context, collection: string, version: number) {
  const rows = ctx.db
    .prepare(
      `SELECT e.item_id AS id, e.data AS data FROM events e JOIN items i ON i.id = e.item_id
       WHERE i.collection = ? AND e.type = 'transitioned' ORDER BY e.id`,
    )
    .all(collection);
  return rows.flatMap((row) => {
    const data = JSON.parse(String(row.data)) as Record<string, unknown>;
    if (data.reason !== 'publish' || data.board_version !== version) return [];
    return [{ id: String(row.id), from: String(data.from), to: String(data.to) }];
  });
}

// The preset catalog with every published board compiled in. A context remembers what it compiled
// and from which catalog, so a call costs one query when nothing was published.
const synced = new WeakMap<
  Context,
  { stamp: string; base: PresetCatalog; result: PresetCatalog }
>();

export function syncBoardPresets(ctx: Context): void {
  const stamp = boardsStamp(ctx.db);
  const known = synced.get(ctx);
  if (known && known.stamp === stamp && ctx.presets === known.result) return;
  const base = known && ctx.presets === known.result ? known.base : ctx.presets;
  const presets = new Map(base.presets);
  for (const row of listBoards(ctx.db)) {
    if (row.liveVersion === null) continue;
    const version = findVersion(ctx.db, row.id, row.liveVersion);
    if (!version) continue;
    const preset: LoadedPreset = {
      ...compileBoard(row.id, row.liveVersion, readDefinition(version.definition)),
      origin: 'project',
    };
    presets.set(row.id, preset);
  }
  const result: PresetCatalog = { ...base, presets };
  ctx.presets = result;
  synced.set(ctx, { stamp, base, result });
}

// The project's built-in board for loose requests, published once; returns its id.
export function ensureRequestsBoard(
  ctx: Context,
  lang: Lang,
  now: Clock = systemClock,
  ids: IdSource = newId,
): string {
  const builtin = () => listBoards(ctx.db).find((row) => row.builtin);
  const existing = builtin();
  if (existing) return existing.id;
  const id = transaction(ctx.db, () => {
    const other = builtin();
    if (other) return other.id;
    const definition = requestsBoard(lang, ids);
    const board = ids('b');
    const at = now();
    insertBoard(ctx.db, { id: board, createdAt: at, builtin: true });
    insertVersion(ctx.db, {
      boardId: board,
      version: 1,
      definition: JSON.stringify(definition),
      publishedAt: at,
      publishedBy: 'otea',
    });
    setLiveVersion(ctx.db, board, 1);
    insertCollection(ctx.db, {
      name: definition.name,
      prefix: prefixOf(ctx, definition.item, definition.name),
      preset: board,
      presetVersion: 1,
      nextSeq: 1,
      icon: null,
    });
    setBoardCollection(ctx.db, board, definition.name);
    return board;
  });
  syncBoardPresets(ctx);
  return id;
}

// What Studio's home offers: the listed single-board templates, then the sets.
export function listTemplates(lang: Lang): TemplateView[] {
  return listedTemplates(lang);
}

export type CreateSetInput = {
  // A template set key (Cambios en varios repos, Producto).
  set: string;
  lang: Lang;
  // The names the person typed for each board, in the set's order; empty keeps the template's.
  boards: readonly { name?: string | undefined; item?: string | undefined }[];
};

// Creates every board of a set as a draft, in one transaction: none, or all of them. A split
// names its child by the child's new board id.
export function createBoardSet(
  ctx: Context,
  input: CreateSetInput,
  now: Clock = systemClock,
  ids: IdSource = newId,
): BoardRecord[] {
  const set = TEMPLATE_SETS.find(({ key }) => key === input.set);
  if (!set) throw new OteaError('not_found', `There is no template ${input.set}`);
  return transaction(ctx.db, () => {
    const boards = set.boards.map((_, index) => {
      const asked = input.boards[index] ?? {};
      return {
        id: ids('b'),
        ...(asked.name?.trim() ? { name: asked.name.trim() } : {}),
        ...(asked.item?.trim() ? { item: asked.item.trim() } : {}),
      };
    });
    const defs = instantiateSet(set, input.lang, boards, ids);
    const taken = namesTaken(ctx);
    const seen: string[] = [];
    for (const def of defs) {
      if (def.name.trim() === '')
        throw new OteaError('invalid_name', 'A board needs a name', { kind: 'board_name_empty' });
      if ([...taken, ...seen].some((name) => same(name, def.name)))
        throw new OteaError('already_exists', `There is already a board called ${def.name}`, {
          kind: 'board_name_taken',
          name: def.name,
        });
      seen.push(def.name);
    }
    const at = now();
    return defs.map((definition, index) => {
      const id = boards[index]?.id ?? ids('b');
      insertBoard(ctx.db, { id, createdAt: at, builtin: false });
      upsertDraft(ctx.db, {
        boardId: id,
        definition: JSON.stringify(definition),
        baseVersion: null,
        updatedAt: at,
        requestItem: null,
        agentNote: null,
      });
      return getBoardRecord(ctx, id);
    });
  });
}

// Creates a board (from a template, or blank) and publishes it at once: what the home does, for the
// CLI.
export function addBoard(
  ctx: Context,
  input: CreateBoardInput & { by: Actor },
  now: Clock = systemClock,
): PublishResult {
  const { by, ...create } = input;
  const record = createBoard(ctx, create, now);
  try {
    return publishBoard(ctx, record.id, { moves: {}, by }, now);
  } catch (error) {
    discardDraft(ctx, record.id, now);
    throw error;
  }
}

// Creates every board of a set and publishes them at once, a part board before the board that
// divides into it: what the home does, for the CLI and otea init.
export function addBoardSet(
  ctx: Context,
  input: CreateSetInput & { by: Actor },
  now: Clock = systemClock,
): PublishResult[] {
  const { by, ...create } = input;
  const records = createBoardSet(ctx, create, now);
  const published = [...records]
    .reverse()
    .map((record) => publishBoard(ctx, record.id, { moves: {}, by }, now));
  return published.reverse();
}
