import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { findEvidence } from '../store/queries.ts';
import type { Context } from './context.ts';
import { requireItem, systemClock } from './items.ts';

// The files of an item the person opened in the reader, on the desk or the phone: kept so that
// what Aprobar says is left unopened holds after a reload and from one device to another. It is
// the reader's bookkeeping, not an act on the item: no event, no change of turn.

export function openedFiles(ctx: Context, id: string): number[] {
  requireItem(ctx.db, id);
  const rows = ctx.db
    .prepare(
      'SELECT evidence_id FROM evidence_opened WHERE item_id = ? ORDER BY opened_at, evidence_id',
    )
    .all(id) as unknown as { evidence_id: number }[];
  return rows.map(({ evidence_id }) => evidence_id);
}

export function markOpened(
  ctx: Context,
  input: { id: string; evidence: number; actor: Actor },
  now = systemClock,
): void {
  if (input.actor.kind !== 'human')
    throw new OteaError('forbidden', 'Only the person opens files in the reader');
  const item = requireItem(ctx.db, input.id);
  const evidence = findEvidence(ctx.db, input.evidence);
  if (!evidence || evidence.itemId !== item.id)
    throw new OteaError('not_found', `${item.id} has no evidence #${input.evidence}`);
  ctx.db
    .prepare(
      `INSERT INTO evidence_opened (evidence_id, item_id, opened_at) VALUES (?, ?, ?)
       ON CONFLICT (evidence_id) DO NOTHING`,
    )
    .run(evidence.id, item.id, now());
}
