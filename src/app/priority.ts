import type { DatabaseSync } from 'node:sqlite';
import { type Analysis, isScaleRole, ROLES, type Role } from '../core/board/analysis.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { transaction } from '../store/database.ts';
import {
  findCollection,
  findItem,
  selectEvents,
  selectEventsOfTypes,
  selectItems,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { systemClock } from './items.ts';
import { liftSetAside } from './set-aside.ts';

// The person's priority on a board's items: what they put on top by hand (`pin`, in the order they
// pinned it) and the order they fixed from the analysis matrix (`rank`). otea next takes what an
// agent holds first, then what was sent back to it, then the pinned items, then the fixed order,
// then the rest as before (core/board/next.ts reads it through priorityOf).

export type Priority = { pin?: number; rank?: number };

type PriorityRow = {
  item_id: string;
  collection: string;
  state: string;
  pin: number | null;
  rank: number | null;
};

// Numbered over open items only, as the Matrix's «Tu orden» counts them: a closed item keeps no
// place, and the ones after it move up (pins across the project, a fixed order per board). The
// stored values stay, so the order between open items never changes.
export function priorityOf(db: DatabaseSync): Map<string, Priority> {
  const rows = (
    db
      .prepare(
        `SELECT p.item_id, i.collection, i.state, p.pin, p.rank
         FROM item_priority p JOIN items i ON i.id = p.item_id`,
      )
      .all() as unknown as PriorityRow[]
  ).filter(({ state }) => !isClosed(positionOf(state)));
  const out = new Map<string, Priority>(rows.map(({ item_id }) => [item_id, {}]));
  const pins = rows.flatMap(({ item_id, pin }) => (pin === null ? [] : [{ item_id, pin }]));
  for (const [index, { item_id }] of pins.sort((a, b) => a.pin - b.pin).entries())
    out.set(item_id, { ...out.get(item_id), pin: index + 1 });
  const ranks = rows.flatMap(({ item_id, collection, rank }) =>
    rank === null ? [] : [{ item_id, collection, rank }],
  );
  ranks.sort((a, b) => a.collection.localeCompare(b.collection) || a.rank - b.rank);
  const placed = new Map<string, number>();
  for (const { item_id, collection } of ranks) {
    const rank = (placed.get(collection) ?? 0) + 1;
    placed.set(collection, rank);
    out.set(item_id, { ...out.get(item_id), rank });
  }
  return out;
}

// Only the person orders the work: an agent asking is refused.
function assertPerson(actor: Actor): void {
  if (actor.kind !== 'human')
    throw new OteaError('forbidden', 'Only the person sets the order of the work');
}

function requireItemsOf(db: DatabaseSync, ids: readonly string[], collection?: string): void {
  for (const id of ids) {
    const item = findItem(db, id);
    if (!item) throw new OteaError('not_found', `There is no item ${id}`);
    if (collection !== undefined && item.collection !== collection)
      throw new OteaError('invalid_id', `${id} is not on this board`);
  }
}

function upsert(
  db: DatabaseSync,
  id: string,
  column: 'pin' | 'rank',
  value: number | null,
  at: string,
) {
  db.prepare(
    `INSERT INTO item_priority (item_id, ${column}, set_at) VALUES (?, ?, ?)
     ON CONFLICT (item_id) DO UPDATE SET ${column} = excluded.${column}, set_at = excluded.set_at`,
  ).run(id, value, at);
}

// "Fijar el orden": the items picked on a board's matrix, in the order given, become its fixed
// order; the board's earlier order is dropped. An empty list clears it.
export function setOrder(
  ctx: Context,
  input: { collection: string; ids: readonly string[]; actor: Actor },
  now = systemClock,
): void {
  assertPerson(input.actor);
  const ids = [...new Set(input.ids)];
  transaction(ctx.db, () => {
    requireItemsOf(ctx.db, ids, input.collection);
    if (!findCollection(ctx.db, input.collection))
      throw new OteaError('not_found', `Collection "${input.collection}" not found`);
    const at = now();
    for (const item of selectItems(ctx.db, { collection: input.collection }))
      upsert(ctx.db, item.id, 'rank', null, at);
    for (const [index, id] of ids.entries()) upsert(ctx.db, id, 'rank', index + 1, at);
    // Each item the person picked for the order is one they want now: one set aside for later
    // is taken up again (P7-R3-1).
    for (const id of ids) liftSetAside(ctx.db, { id, actor: input.actor, at, cause: 'order' });
  });
}

// "Poner arriba": puts items on top of the work, after the ones already pinned, in the order given;
// `pinned: false` takes them down.
export function pinItems(
  ctx: Context,
  input: { ids: readonly string[]; pinned: boolean; actor: Actor },
  now = systemClock,
): void {
  assertPerson(input.actor);
  const ids = [...new Set(input.ids)];
  transaction(ctx.db, () => {
    requireItemsOf(ctx.db, ids);
    const at = now();
    if (!input.pinned) {
      for (const id of ids) upsert(ctx.db, id, 'pin', null, at);
      return;
    }
    const top = ctx.db.prepare('SELECT MAX(pin) AS top FROM item_priority').get() as {
      top: number | null;
    };
    let next = (top.top ?? 0) + 1;
    const current = priorityOf(ctx.db);
    for (const id of ids) {
      // Put on top, an item set aside for later is taken up again (P7-R3-1).
      liftSetAside(ctx.db, { id, actor: input.actor, at, cause: 'pin' });
      if (current.get(id)?.pin !== undefined) continue;
      upsert(ctx.db, id, 'pin', next, at);
      next += 1;
    }
  });
}

// Who last set each role's field on an item, when it was an agent: the matrix says "estimado por
// un agente" until the person sets the value. A value set when the item was created is its
// creator's; a later change is whoever changed it.
type Estimated = {
  id: string;
  collection: string;
  fields: Record<string, unknown>;
  createdBy: Actor;
};
type Updated = { actor: Actor; data: Record<string, unknown> };

export function estimatesOf(
  ctx: Context,
  item: { id: string; fields: Record<string, unknown>; createdBy: Actor },
  def: BoardDefinition,
): Partial<Record<string, string>> {
  const refs = scaleRefs(def.analysis);
  if (refs.length === 0) return {};
  const updates = selectEvents(ctx.db, item.id).filter(({ type }) => type === 'updated');
  return estimatesFrom(item, refs, updates);
}

// The same for a whole list (the board's items in /api/items): every item's updates come from one
// query instead of one per item. An item without estimates is left out of the map.
export function estimatesOfItems(
  ctx: Context,
  items: readonly Estimated[],
  defOf: (collection: string) => BoardDefinition | undefined,
): Map<string, Partial<Record<string, string>>> {
  const refsOf = new Map<string, string[]>();
  for (const { collection } of items) {
    if (!refsOf.has(collection)) refsOf.set(collection, scaleRefs(defOf(collection)?.analysis));
  }
  const out = new Map<string, Partial<Record<string, string>>>();
  if (![...refsOf.values()].some((refs) => refs.length > 0)) return out;
  const updates = new Map<string, Updated[]>();
  for (const event of selectEventsOfTypes(ctx.db, ['updated'])) {
    const list = updates.get(event.itemId);
    if (list) list.push(event);
    else updates.set(event.itemId, [event]);
  }
  for (const item of items) {
    const refs = refsOf.get(item.collection) ?? [];
    if (refs.length === 0) continue;
    const estimates = estimatesFrom(item, refs, updates.get(item.id) ?? []);
    if (Object.keys(estimates).length > 0) out.set(item.id, estimates);
  }
  return out;
}

// Who last set each role's field: its creator for a value set at creation, else the last update.
function estimatesFrom(
  item: { fields: Record<string, unknown>; createdBy: Actor },
  refs: readonly string[],
  updates: readonly Updated[],
): Partial<Record<string, string>> {
  const by = new Map<string, Actor>();
  for (const ref of refs) if (item.fields[ref] !== undefined) by.set(ref, item.createdBy);
  for (const event of updates) {
    const changes = (event.data.changes ?? {}) as Record<string, unknown>;
    for (const ref of refs) if (ref in changes) by.set(ref, event.actor);
  }
  const out: Partial<Record<string, string>> = {};
  for (const ref of refs) {
    const actor = by.get(ref);
    if (actor?.kind === 'agent' && item.fields[ref] !== undefined) out[ref] = actor.name;
  }
  return out;
}

function scaleRefs(analysis: Analysis | undefined): string[] {
  if (!analysis) return [];
  return ROLES.filter((role: Role) => isScaleRole(role))
    .map((role) => analysis[role])
    .filter((ref): ref is string => ref !== undefined);
}
