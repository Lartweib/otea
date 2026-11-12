import { compileBoard } from '../core/board/compile.ts';
import { isClosed, positionOf, stateOf } from '../core/board/engine.ts';
import { boardFromPreset } from '../core/board/from-preset.ts';
import { type IdSource, newId } from '../core/board/ids.ts';
import { type BoardDefinition, isAgent, type Target } from '../core/board/model.ts';
import {
  type Change,
  changePlan,
  type ItemEffects,
  itemEffects,
  itemMoves,
} from '../core/board/plan.ts';
import { blocking, type Problem, problemsOf } from '../core/board/problems.ts';
import { parseDefinition, readDefinition } from '../core/board/schema.ts';
import {
  blankBoard,
  instantiate,
  type Lang,
  requestsBoard,
  TEMPLATES,
  type TemplateView,
  templateView,
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
  insertCollection,
  listCollections,
  selectAgents,
  selectItems,
  setCollectionPreset,
  updateItemState,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Clock, systemClock } from './items.ts';
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

export function boardProblems(ctx: Context, id: string, definition: BoardDefinition): Problem[] {
  return problemsOf(definition, { agents: agentsOf(ctx), takenNames: namesTaken(ctx, id) });
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
  if (name === '') throw new OteaError('invalid_name', 'A board needs a name');
  {
    if (namesTaken(ctx).some((taken) => same(taken, name)))
      throw new OteaError('already_exists', `There is already a board called ${name}`);
    const names = { name, ...(input.item?.trim() ? { item: input.item.trim() } : {}) };
    let definition: BoardDefinition;
    if (input.template !== undefined) {
      const template = TEMPLATES.find(({ key }) => key === input.template);
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

export type SaveDraftInput = { definition: unknown; baseVersion: number | null };

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
    );
  return transaction(ctx.db, () => {
    const row = requireRow(ctx, id);
    if (row.liveVersion !== input.baseVersion)
      throw new OteaError(
        'board_conflict',
        `The board changed since this draft started: it is at version ${row.liveVersion ?? 'none'} now`,
      );
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
};

function requireDraft(ctx: Context, id: string): NonNullable<BoardRecord['draft']> {
  const draft = getBoardRecord(ctx, id).draft;
  if (!draft) throw new OteaError('not_found', 'The board has no draft to publish');
  return draft;
}

function itemStates(ctx: Context, collection: string | null) {
  if (collection === null) return [];
  return selectItems(ctx.db, { collection }).map(({ id, state }) => ({ id, state }));
}

export function publishPlan(ctx: Context, id: string): PublishPlan {
  const record = getBoardRecord(ctx, id);
  const draft = requireDraft(ctx, id).definition;
  const live = record.live?.definition ?? null;
  const items = itemStates(ctx, record.collection);
  return {
    from: record.live?.version ?? null,
    to: maxVersion(ctx.db, id) + 1,
    changes: changePlan(live, draft),
    effects: live ? itemEffects(live, draft, items) : { moves: [], needs: [], reopened: [] },
    problems: boardProblems(ctx, id, draft),
  };
}

// A prefix for a new board's item ids: the first letters of what each item is called.
function prefixOf(ctx: Context, item: string, name: string): string {
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

export type PublishInput = { moves: Readonly<Record<string, Target>>; by: Actor };

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
  const result = transaction(ctx.db, () => {
    const row = requireRow(ctx, id);
    const record = recordOf(ctx, row);
    const draft = requireDraft(ctx, id).definition;
    const problems = boardProblems(ctx, id, draft);
    if (blocking(problems)) {
      const codes = problems.filter(({ level }) => level === 'error').map(({ code }) => code);
      throw new OteaError('not_publishable', `The draft has errors: ${codes.join(', ')}`);
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
    deleteDraft(ctx.db, id);
    return { version, moved, record: getBoardRecord(ctx, id) };
  });
  syncBoardPresets(ctx);
  return result;
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
  const result = transaction(ctx.db, () => {
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
  });
  syncBoardPresets(ctx);
  return result;
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

// Whether a board can say what the preset does. A preset with several item types (a change and its
// repo tasks), states that wait for closed children or blockers, or gates on git actions is more
// than steps on two lanes: its collection stays on the preset, with all of that.
export function sayableAsBoard(preset: LoadedPreset): boolean {
  const [type, ...others] = preset.types;
  if (!type || others.length > 0) return false;
  const { workflow } = type;
  if (workflow.gates && Object.keys(workflow.gates).length > 0) return false;
  return workflow.states.every(({ requires }) => (requires ?? []).length === 0);
}

// Reads every collection still on a preset file as a published board (version 1), mapping its
// items' states to the board's; returns how many it read. Run when a project opens.
export function migrateCollections(
  ctx: Context,
  lang: Lang,
  now: Clock = systemClock,
  ids: IdSource = newId,
  playbookOf: (preset: LoadedPreset) => string | null = () => null,
): number {
  const readable = (name: string) => {
    const preset = ctx.presets.presets.get(name);
    return preset !== undefined && sayableAsBoard(preset);
  };
  // The boards of the project's blueprint answer to it, links and all: they stay on their presets.
  const inBlueprint = new Set((ctx.blueprint?.boards ?? []).map(({ name }) => name));
  const unread = () =>
    listCollections(ctx.db).filter(
      ({ name, preset }) =>
        readable(preset) && !inBlueprint.has(name) && !findBoardOfCollection(ctx.db, name),
    );
  if (unread().length === 0) return 0;
  // Read again inside the write lock: another process may have just read them.
  const read = transaction(ctx.db, () => {
    const pending = unread();
    let count = 0;
    for (const collection of pending) {
      const preset = ctx.presets.presets.get(collection.preset);
      if (!preset) continue;
      const reading = boardFromPreset(preset, {
        name: collection.name,
        lang,
        playbook: playbookOf(preset),
      });
      const { states, values } = reading;
      // A reading the board schema would not read back stays on its preset: a corrupt version
      // would keep the project from opening at all.
      const checked = parseDefinition(JSON.parse(JSON.stringify(reading.definition)));
      if (!checked.ok) continue;
      const { definition } = checked;
      try {
        compileBoard('bcheck', 1, definition);
      } catch {
        continue;
      }
      count++;
      const id = ids('b');
      const at = now();
      insertBoard(ctx.db, { id, createdAt: at, builtin: false });
      insertVersion(ctx.db, {
        boardId: id,
        version: 1,
        definition: JSON.stringify(definition),
        publishedAt: at,
        publishedBy: 'otea',
      });
      setLiveVersion(ctx.db, id, 1);
      setBoardCollection(ctx.db, id, collection.name);
      setCollectionPreset(ctx.db, collection.name, id, 1);
      const first = definition.steps[0]?.id ?? 'done';
      ctx.db.prepare("UPDATE items SET type = 'item' WHERE collection = ?").run(collection.name);
      for (const item of selectItems(ctx.db, { collection: collection.name })) {
        const fields = valuesAsChoices(item.fields, values);
        if (fields !== item.fields) {
          ctx.db
            .prepare('UPDATE items SET fields = ? WHERE id = ?')
            .run(JSON.stringify(fields), item.id);
        }
        const to = states[item.state] ?? first;
        if (to === item.state) continue;
        updateItemState(ctx.db, item.id, to, item.updatedAt);
        appendEvent(ctx.db, {
          itemId: item.id,
          type: 'transitioned',
          actor: { kind: 'human', name: 'otea' },
          at,
          data: { from: item.state, to, reason: 'migrate', channel: 'ui' },
        });
      }
    }
    return count;
  });
  syncBoardPresets(ctx);
  return read;
}

// An item's fields with each old enum value as the choice id the board gave it; the same object
// when nothing changes.
function valuesAsChoices(
  fields: Record<string, unknown>,
  values: Readonly<Record<string, Record<string, string>>>,
): Record<string, unknown> {
  let out = fields;
  for (const [key, map] of Object.entries(values)) {
    const value = fields[key];
    if (typeof value !== 'string' || map[value] === undefined) continue;
    if (out === fields) out = { ...fields };
    out[key] = map[value];
  }
  return out;
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

export function listTemplates(lang: Lang): TemplateView[] {
  return TEMPLATES.map((template) => templateView(template, lang));
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
