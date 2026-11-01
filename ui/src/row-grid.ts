// The row grid: one set of fixed columns for every row of the list, at every nesting level. Shared
// with list.css (the grid) and lanes.ts (the branch hangs off the type slot).
//
// rail 56 · fold 28 (always reserved) · indent 28 a level · type 30 (a 20px slot and 10 of air) ·
// title (the one column that flexes) · priority 48 · who 80 · when 56. A row stops at 760px.
export const GRID = {
  rail: 56,
  fold: 28,
  step: 28,
  type: 30,
  slot: 20,
  priority: 48,
  who: 80,
  when: 56,
  cap: 760,
} as const;

// A row reads in two lines, title over id · state. Its node and type slot sit on the title line.
export const ROW = {
  top: { height: 62, node: 21 },
  child: { height: 54, node: 18 },
} as const;

export const MAX_DEPTH = 3;

// Where the type slot of a row at a depth starts, and its centre.
export function slotLeft(depth: number): number {
  return GRID.rail + GRID.fold + GRID.step * depth;
}

export function slotCentre(depth: number): number {
  return slotLeft(depth) + GRID.slot / 2;
}

// What a row shows is decided by the list pane's width alone, always in the same order:
// 1 everything; 2 the priority column and evidence chips go; 3 who becomes the agent mark and a
// parent's count shortens; 4 who goes and a parent keeps only its bar. The time always stays.
export type HideTier = 1 | 2 | 3 | 4;

export const TIER_FLOORS = { 1: 600, 2: 480, 3: 380 } as const;

export function hideTier(listWidth: number): HideTier {
  if (listWidth >= TIER_FLOORS[1]) return 1;
  if (listWidth >= TIER_FLOORS[2]) return 2;
  if (listWidth >= TIER_FLOORS[3]) return 3;
  return 4;
}
