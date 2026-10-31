import { GRID, slotCentre, slotLeft } from './row-grid.ts';
import type { Turn } from './types.ts';

// Lane geometry of the list gutter (56px wide): agent lane left, your lane right, closed items on the trunk.
export const LANE = { agent: 16, trunk: 28, you: 40 } as const;

export function laneX(turn: Turn): number {
  if (turn === 'human') return LANE.you;
  if (turn === 'agent') return LANE.agent;
  return LANE.trunk;
}

// A block is one stacked slice of the list: a row (it has a turn) or anything else (headings, notes).
// node is how far below its top a row draws its node: the centre unless given (the title line).
// between: a closed row nested under an open parent, between the lanes, which run on past it.
export type Block = { height: number; turn?: Turn; node?: number; between?: boolean };

export type LaneLayout = {
  height: number;
  rows: { y: number; x: number }[];
  agentLane: string;
  youLane: string;
  trunk: string;
};

export function layoutLanes(blocks: readonly Block[]): LaneLayout {
  const rows: LaneLayout['rows'] = [];
  let lastOpen = 0;
  let firstClosed: number | undefined;
  let top = 0;
  for (const { height, turn, node = height / 2, between = false } of blocks) {
    if (turn) {
      const y = top + node;
      rows.push({ y, x: laneX(turn) });
      // An open row keeps the lanes straight as far past its bottom as its node sits below its top.
      if (turn === 'none' && !between) firstClosed ??= y;
      else lastOpen = top + height - node;
    }
    top += height;
  }
  // Nothing closed: the lanes still meet, at the very bottom, so they never end in a broken Y.
  const fuseAt = firstClosed ?? top;
  const mid = (lastOpen + fuseAt) / 2;
  const fuse = (x: number) =>
    `M${x} 0 V${lastOpen} C${x} ${mid} ${LANE.trunk} ${mid} ${LANE.trunk} ${fuseAt}`;
  return {
    height: top,
    rows,
    agentLane: fuse(LANE.agent),
    youLane: fuse(LANE.you),
    trunk: `M${LANE.trunk} ${fuseAt} V${top}`,
  };
}

// Branches: a parent's children hang from it in a quiet tree, off the lanes: the lanes mean turn,
// the branch means hierarchy, and the two never touch. The branch leaves from the parent's type slot
// (its centre, 3px under the slot, icon or not), drops straight down and turns into each child with
// an 8px elbow, stopping 4px before the child's slot. Lines live in their rows: each row draws its
// own piece, so a row that moves carries its piece with it.
export const BRANCH = { below: 3, elbow: 8, gap: 4 } as const;

// A row as the branch sees it: how deep it nests, its height and how far down its title line sits,
// and whether its children are shown right under it.
export type TreeRow = { depth: number; height: number; node: number; opens: boolean };

// A piece of the branch inside one row, in the row's own coordinates. level: the depth of the parent
// it hangs from. y0..y1: the span the line's head covers while it draws this piece (tree draw).
export type BranchPiece = {
  kind: 'leg' | 'elbow' | 'stub';
  level: number;
  y0: number;
  y1: number;
  d: string;
};

// The head of the tree draw covers 20px of travel while it draws an elbow.
const ELBOW_TRAVEL = 20;

// For each row (in list order, depth stepping by one), whether it is the last child of its parent.
function lastChildren(rows: readonly TreeRow[]): boolean[] {
  return rows.map((row, index) => {
    for (const next of rows.slice(index + 1)) {
      if (next.depth < row.depth) return true;
      if (next.depth === row.depth) return false;
    }
    return true;
  });
}

export function branchPieces(rows: readonly TreeRow[]): BranchPiece[][] {
  const last = lastChildren(rows);
  // The row at each depth on the way down to the current one.
  const chain: number[] = [];
  return rows.map((row, index) => {
    const { depth, height, node } = row;
    chain[depth] = index;
    chain.length = depth + 1;
    const pieces: BranchPiece[] = [];
    if (depth > 0) {
      // An ancestor's branch runs on past this row while that ancestor has siblings still to come.
      for (let level = 0; level < depth - 1; level++) {
        const ancestor = chain[level + 1];
        if (ancestor !== undefined && !last[ancestor]) {
          const x = slotCentre(level);
          pieces.push({ kind: 'leg', level, y0: 0, y1: height, d: `M${x} 0 V${height}` });
        }
      }
      const x = slotCentre(depth - 1);
      const bend = node - BRANCH.elbow;
      const end = last[index] ? bend : height;
      pieces.push({ kind: 'leg', level: depth - 1, y0: 0, y1: end, d: `M${x} 0 V${end}` });
      pieces.push({
        kind: 'elbow',
        level: depth - 1,
        y0: bend,
        y1: bend + ELBOW_TRAVEL,
        d: `M${x} ${bend} Q${x} ${node} ${x + BRANCH.elbow} ${node} H${slotLeft(depth) - BRANCH.gap}`,
      });
    }
    if (row.opens) {
      const x = slotCentre(depth);
      const from = node + GRID.slot / 2 + BRANCH.below;
      pieces.push({
        kind: 'stub',
        level: depth,
        y0: from,
        y1: height,
        d: `M${x} ${from} V${height}`,
      });
    }
    return pieces;
  });
}
