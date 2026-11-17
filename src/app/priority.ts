import type { DatabaseSync } from 'node:sqlite';
import { type Analysis, isScaleRole, ROLES, type Role } from '../core/board/analysis.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { transaction } from '../store/database.ts';
import { findItem, selectEvents, selectItems } from '../store/queries.ts';
import type { Context } from './context.ts';
import { systemClock } from './items.ts';

// The person's priority on a board's items: what they put on top by hand (`pin`, in the order they
// pinned it) and the order they fixed from the analysis matrix (`rank`). otea next takes what an
// agent holds first, then what was sent back to it, then the pinned items, then the fixed order,
// then the rest as before (core/board/next.ts reads it through priorityOf).

export type Priority = { pin?: number; rank?: number };

type PriorityRow = { item_id: string; pin: number | null; rank: number | null };

export function priorityOf(db: DatabaseSync): Map<string, Priority> {
  const rows = db
    .prepare('SELECT item_id, pin, rank FROM item_priority')
    .all() as unknown as PriorityRow[];
  return new Map(
    rows.map(({ item_id, pin, rank }) => [
      item_id,
      { ...(pin === null ? {} : { pin }), ...(rank === null ? {} : { rank }) },
    ]),
  );
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
    const at = now();
    for (const item of selectItems(ctx.db, { collection: input.collection }))
      upsert(ctx.db, item.id, 'rank', null, at);
    for (const [index, id] of ids.entries()) upsert(ctx.db, id, 'rank', index + 1, at);
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
      if (current.get(id)?.pin !== undefined) continue;
      upsert(ctx.db, id, 'pin', next, at);
      next += 1;
    }
  });
}

// Who last set each role's field on an item, when it was an agent: the matrix says "estimado por
// un agente" until the person sets the value. A value set when the item was created is its
// creator's; a later change is whoever changed it.
export function estimatesOf(
  ctx: Context,
  item: { id: string; fields: Record<string, unknown>; createdBy: Actor },
  def: BoardDefinition,
): Partial<Record<string, string>> {
  const refs = scaleRefs(def.analysis);
  if (refs.length === 0) return {};
  const by = new Map<string, Actor>();
  for (const ref of refs) if (item.fields[ref] !== undefined) by.set(ref, item.createdBy);
  for (const event of selectEvents(ctx.db, item.id)) {
    if (event.type !== 'updated') continue;
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
