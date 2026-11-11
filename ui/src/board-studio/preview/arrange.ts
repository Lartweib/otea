import { startsWith } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  partOf,
  stepById,
  TITLE,
  type Zone,
} from '../../../../src/core/board/model.ts';
import { defaultZone } from '../../../../src/core/board/templates.ts';

// Acomodar: where each box of the item page sits (Arriba, Principal, Al lado, Oculto) and which
// show as columns in the list row. A move only changes how things show, never what is asked for:
// it writes `layout` (whose key order is the tiles' order) and `row`.

export type Place = Zone | 'row';
export const PLACES: readonly Place[] = ['top', 'main', 'side', 'row', 'hidden'];

// Where a box comes from: the creation form, a step's handoff, any time, or only the list row.
export type Origin =
  | { kind: 'form' }
  | { kind: 'step'; step: string }
  | { kind: 'anytime' }
  | { kind: 'column' };

export type Tile = {
  ref: string;
  origin: Origin;
  // Handed off in the step on screen (empty while the step is being done).
  now: boolean;
  // A column of the list row.
  column?: boolean;
};

export function zoneOf(def: BoardDefinition, ref: string): Zone {
  const set = def.layout[ref];
  if (set) return set;
  const part = partOf(def, ref);
  return part ? defaultZone(part.kind) : 'side';
}

// The boxes the item has at a step, by zone, in tile order; the list row's columns apart.
export function pageTiles(def: BoardDefinition, stepId: string): Record<Place, Tile[]> {
  const listed: Tile[] = [];
  const add = (ref: string, origin: Origin, now = false) => {
    if (ref === TITLE || !partOf(def, ref) || listed.some((tile) => tile.ref === ref)) return;
    listed.push({ ref, origin, now });
  };
  for (const { ref, from } of startsWith(def, stepId))
    add(ref, from ? { kind: 'step', step: from } : { kind: 'form' });
  for (const { ref } of stepById(def, stepId)?.hand ?? [])
    add(ref, { kind: 'step', step: stepId }, true);
  for (const ref of def.anytime) add(ref, { kind: 'anytime' });

  const order = Object.keys(def.layout);
  const rank = (ref: string) => {
    const at = order.indexOf(ref);
    return at < 0 ? order.length + listed.findIndex((tile) => tile.ref === ref) : at;
  };
  const out: Record<Place, Tile[]> = { top: [], main: [], side: [], row: [], hidden: [] };
  for (const tile of [...listed].sort((a, b) => rank(a.ref) - rank(b.ref)))
    out[zoneOf(def, tile.ref)].push(tile);
  for (const ref of def.row) {
    if (!partOf(def, ref)) continue;
    const at = listed.find((tile) => tile.ref === ref);
    out.row.push({
      ref,
      origin: at?.origin ?? { kind: 'column' },
      now: at?.now ?? false,
      column: true,
    });
  }
  return out;
}

// Moves a box (mutating the definition, for draft.mutate): to a zone, at the end or before another
// box; to the list row as a column (the box stays where it is); or off the row ('unrow'). A column
// dragged from the row into a zone leaves the row.
export function moveTile(
  def: BoardDefinition,
  ref: string,
  to: Place | 'unrow',
  before?: string,
  options: { fromRow?: boolean } = {},
): void {
  if (to === 'unrow') {
    def.row = def.row.filter((r) => r !== ref);
    return;
  }
  if (to === 'row') {
    const row = def.row.filter((r) => r !== ref);
    const at = before === undefined ? -1 : row.indexOf(before);
    row.splice(at < 0 ? row.length : at, 0, ref);
    def.row = row;
    return;
  }
  if (options.fromRow) def.row = def.row.filter((r) => r !== ref);
  const entries = Object.entries(def.layout).filter(([key]) => key !== ref);
  if (before !== undefined && before !== ref && !entries.some(([key]) => key === before))
    entries.push([before, zoneOf(def, before)]);
  const at = before === undefined ? -1 : entries.findIndex(([key]) => key === before);
  entries.splice(at < 0 ? entries.length : at, 0, [ref, to]);
  def.layout = Object.fromEntries(entries);
}
