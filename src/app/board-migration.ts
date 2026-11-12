import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { compileBoard } from '../core/board/compile.ts';
import { type IdSource, newId } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import {
  genericBoard,
  genericState,
  type Reading,
  readBoards,
  readingOf,
  rereadable,
  routeItem,
} from '../core/board/readings.ts';
import { parseDefinition, readDefinition } from '../core/board/schema.ts';
import type { Lang } from '../core/board/templates.ts';
import {
  findBoardOfCollection,
  findVersion,
  insertBoard,
  insertVersion,
  listBoards,
  maxVersion,
  setBoardCollection,
  setLiveVersion,
} from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type CollectionRecord,
  insertCollection,
  listCollections,
  selectEvents,
  selectEvidence,
  selectItems,
  setCollectionPreset,
  updateItemState,
} from '../store/queries.ts';
import { prefixOf, syncBoardPresets } from './boards.ts';
import type { Context } from './context.ts';
import { type Clock, systemClock } from './items.ts';

// Every collection becomes a board when a project opens, once: a collection still on a preset, and
// a board an earlier reading made of a shipped preset that nobody published since, are read by
// core/board/readings.ts. A preset with a second kind of item (change: its repo tasks) becomes a
// second board its items move to, with their history, links and evidence; Falta información
// becomes Completar's next round, with the person's question as its note. Collections on presets
// Otea never shipped read as one step that keeps their data. Returns how many collections it read.

const OTEA = { kind: 'human' as const, name: 'otea' };

type Plan = {
  collection: CollectionRecord;
  // The board the collection is on already (an earlier reading), read again in place.
  board?: { id: string; version: number };
  reading?: Reading;
};

function pending(ctx: Context): Plan[] {
  return listCollections(ctx.db).flatMap((collection): Plan[] => {
    const row = findBoardOfCollection(ctx.db, collection.name);
    if (!row) {
      if (listBoards(ctx.db).some(({ id }) => id === collection.preset)) return [];
      const reading = readingOf(collection.preset);
      return [{ collection, ...(reading ? { reading } : {}) }];
    }
    if (row.liveVersion === null) return [];
    const version = findVersion(ctx.db, row.id, row.liveVersion);
    if (!version) return [];
    const live = readDefinition(version.definition);
    const board = {
      liveVersion: row.liveVersion,
      publishedBy: version.publishedBy,
      ...(live.template === undefined ? {} : { template: live.template }),
    };
    // An earlier reading named its board after the preset; this one after its own template.
    if (!rereadable(board) || !live.template) return [];
    const reading = readingOf(live.template);
    return reading
      ? [{ collection, board: { id: row.id, version: row.liveVersion }, reading }]
      : [];
  });
}

// The board names taken in the project, for the second board of a reading.
function freeName(ctx: Context, wanted: string): string {
  const taken = new Set(listCollections(ctx.db).map(({ name }) => name.toLocaleLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? wanted : `${wanted} ${n}`;
    if (!taken.has(name.toLocaleLowerCase())) return name;
  }
}

function checked(def: BoardDefinition): BoardDefinition | undefined {
  const reading = parseDefinition(JSON.parse(JSON.stringify(def)));
  if (!reading.ok) return undefined;
  try {
    compileBoard('bcheck', 1, reading.definition);
  } catch {
    return undefined;
  }
  return reading.definition;
}

// The reason of the item's last move into `state`: the person's question in Falta información.
function askedReason(ctx: Context, item: string, state: string): string | undefined {
  const moves = selectEvents(ctx.db, item).filter(
    ({ type, data }) => type === 'transitioned' && data.to === state,
  );
  const reason = moves.at(-1)?.data.reason;
  return typeof reason === 'string' && reason !== 'migrate' ? reason : undefined;
}

// The preset state an earlier reading moved the item out of.
function migratedFrom(ctx: Context, item: string): string | undefined {
  const moves = selectEvents(ctx.db, item).filter(
    ({ type, data }) => type === 'transitioned' && data.reason === 'migrate',
  );
  const from = moves.at(-1)?.data.from;
  return typeof from === 'string' ? from : undefined;
}

function publish(
  ctx: Context,
  board: string,
  version: number,
  definition: BoardDefinition,
  at: string,
): void {
  insertVersion(ctx.db, {
    boardId: board,
    version,
    definition: JSON.stringify(definition),
    publishedAt: at,
    publishedBy: 'otea',
  });
  setLiveVersion(ctx.db, board, version);
}

// A board other boards' items block (a blueprint's `blocks` connection into it) waits, on its
// working step (its last), for nothing open to block an item.
function waitingForBlockers(def: BoardDefinition): BoardDefinition {
  const last = def.steps.at(-1);
  if (!last || last.waits.includes('blockers')) return def;
  return {
    ...def,
    steps: def.steps.map((step) =>
      step === last ? { ...step, waits: [...step.waits, 'blockers' as const] } : step,
    ),
  };
}

function readOne(
  ctx: Context,
  plan: Plan,
  lang: Lang,
  at: string,
  ids: IdSource,
  blocked: ReadonlySet<string>,
): boolean {
  const { collection, reading } = plan;
  const waits = (def: BoardDefinition) =>
    blocked.has(collection.name) ? waitingForBlockers(def) : def;
  const items = selectItems(ctx.db, { collection: collection.name });
  if (!reading) {
    const fields = [...new Set(items.flatMap((item) => Object.keys(item.fields)))];
    const evidence = [
      ...new Map(
        items
          .flatMap((item) => selectEvidence(ctx.db, item.id))
          .flatMap(({ module }) => (module ? [[module, { id: module, module }] as const] : [])),
      ).values(),
    ];
    const def = checked(waits(genericBoard(collection.name, lang, fields, evidence, ids)));
    if (!def) return false;
    const preset = ctx.presets.presets.get(collection.preset);
    const closes = (state: string) =>
      preset?.workflow.states.find(({ name }) => name === state)?.closes;
    const id = ids('b');
    insertBoard(ctx.db, { id, createdAt: at, builtin: false });
    publish(ctx, id, 1, def, at);
    setBoardCollection(ctx.db, id, collection.name);
    setCollectionPreset(ctx.db, collection.name, id, 1);
    for (const item of items) {
      const closed = closes(item.state);
      const to =
        closed === 'done'
          ? 'done'
          : genericState(def, { state: item.state, open: closed === undefined });
      move(ctx, item, collection.name, to, at);
    }
    return true;
  }
  const boardIds = reading.boards.map((_, index) =>
    index === 0 && plan.board ? plan.board.id : ids('b'),
  );
  const names = reading.boards.map(({ template }, index) =>
    index === 0 ? collection.name : freeName(ctx, template.board[lang]),
  );
  const defs = readBoards(reading, lang, names, boardIds).map((def, index) =>
    checked(index === 0 ? waits(def) : def),
  );
  if (defs.some((def) => def === undefined)) return false;
  defs.forEach((def, index) => {
    const id = boardIds[index] ?? '';
    if (!def) return;
    if (index === 0 && plan.board) {
      const version = maxVersion(ctx.db, id) + 1;
      publish(ctx, id, version, def, at);
      setCollectionPreset(ctx.db, collection.name, id, version);
      return;
    }
    insertBoard(ctx.db, { id, createdAt: at, builtin: false });
    publish(ctx, id, 1, def, at);
    if (index === 0) {
      setBoardCollection(ctx.db, id, collection.name);
      setCollectionPreset(ctx.db, collection.name, id, 1);
      return;
    }
    const name = names[index] ?? def.name;
    insertCollection(ctx.db, {
      name,
      prefix: prefixOf(ctx, def.item, name),
      preset: id,
      presetVersion: 1,
      nextSeq: 1,
      icon: null,
    });
    setBoardCollection(ctx.db, id, name);
  });
  for (const item of items) {
    const from = plan.board ? migratedFrom(ctx, item.id) : undefined;
    const route = routeItem(reading, {
      type: item.type,
      state: item.state,
      ...(from === undefined ? {} : { migratedFrom: from }),
    });
    const to = names[route.board] ?? collection.name;
    const note = route.note ? askedReason(ctx, item.id, item.state) : undefined;
    move(ctx, item, to, route.state, at, note);
  }
  for (const name of names.slice(1)) numberAfterMoved(ctx, name);
  return true;
}

// Moved items keep their number; the board they moved to numbers its new items after the highest.
function numberAfterMoved(ctx: Context, collection: string): void {
  ctx.db
    .prepare(
      `UPDATE collections SET next_seq = MAX(next_seq,
         (SELECT COALESCE(MAX(seq), 0) + 1 FROM items WHERE collection = ?)) WHERE name = ?`,
    )
    .run(collection, collection);
}

// Puts an item on its board: its collection, the one item type, and its state, with a migrate
// event (the start of its history on the board; `note`, the note of the round it starts).
function move(
  ctx: Context,
  item: { id: string; collection: string; state: string; updatedAt: string },
  collection: string,
  state: string,
  at: string,
  note?: string,
): void {
  ctx.db
    .prepare("UPDATE items SET collection = ?, type = 'item' WHERE id = ?")
    .run(collection, item.id);
  if (state === item.state && collection === item.collection && note === undefined) return;
  updateItemState(ctx.db, item.id, state, item.updatedAt);
  appendEvent(ctx.db, {
    itemId: item.id,
    type: 'transitioned',
    actor: OTEA,
    at,
    data: {
      from: item.state,
      to: state,
      reason: 'migrate',
      channel: 'ui',
      ...(note === undefined ? {} : { note }),
    },
  });
}

export function migrateBoards(
  ctx: Context,
  lang: Lang,
  now: Clock = systemClock,
  ids: IdSource = newId,
  // Collections a blueprint's `blocks` connection pointed into.
  blocked: ReadonlySet<string> = new Set(),
): number {
  if (pending(ctx).length === 0) return 0;
  // Read again inside the write lock: another process may have just read them.
  const count = transaction(ctx.db, () => {
    const at = now();
    return pending(ctx).filter((plan) => readOne(ctx, plan, lang, at, ids, blocked)).length;
  });
  syncBoardPresets(ctx);
  return count;
}

// The boards a project's old blueprint (`.otea/blueprint.yaml`) said other boards' items block:
// `<board>.<type> blocks <board>.<type>`. Unreadable or missing reads as none.
export function blockedByBlueprint(dataDir: string): Set<string> {
  const path = join(dataDir, 'blueprint.yaml');
  if (!existsSync(path)) return new Set();
  try {
    const doc: unknown = parse(readFileSync(path, 'utf8'));
    const connections =
      doc && typeof doc === 'object' && 'connections' in doc && Array.isArray(doc.connections)
        ? doc.connections
        : [];
    return new Set(
      connections.flatMap((text: unknown) => {
        const match =
          typeof text === 'string' ? /^\s*\S+\.\S+\s+blocks\s+(\S+)\.\S+\s*$/.exec(text) : null;
        return match?.[1] ? [match[1]] : [];
      }),
    );
  } catch {
    return new Set();
  }
}

// Reads every collection as boards (a blueprint's blocks become waits), then forgets the
// blueprint: boards link freely, and "se divide en" is the only join they declare.
export function migrateProjectBoards(ctx: Context & { dataDir: string }, lang: Lang): number {
  const path = join(ctx.dataDir, 'blueprint.yaml');
  const count = migrateBoards(ctx, lang, systemClock, newId, blockedByBlueprint(ctx.dataDir));
  if (existsSync(path)) rmSync(path, { force: true });
  return count;
}
