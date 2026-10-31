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

// Branches: a parent's children hang from it. The branch leaves the bottom of the parent's node, bends
// once (the lanes' own S-bend) into a sub-lane of its own right of your lane and left of the rows,
// drops beside the children and turns into each child's icon column with a soft elbow. It stays
// clear of the parent's icon, its title and its highlight. Deeper levels drop from the bottom of their
// parent row, one step further right. Geometry shared with list.css: row content starts at x=68 and
// steps 20px per level; the row highlight starts at x=58.
export const BRANCH = { x: 52, step: 20, elbow: 8, content: 68, gap: 8, node: 6 } as const;

// A row as the branches see it: where it sits, where its node is, and how deep it nests.
export type BranchRow = { top: number; height: number; node: number; x: number; depth: number };

export type Branch = { d: string; yours: boolean };

export function layoutBranches(rows: readonly BranchRow[]): Branch[] {
  const branches: Branch[] = [];
  rows.forEach((parent, index) => {
    const children: BranchRow[] = [];
    for (const row of rows.slice(index + 1)) {
      if (row.depth <= parent.depth) break;
      if (row.depth === parent.depth + 1) children.push(row);
    }
    if (children.length === 0) return;
    const x = BRANCH.x + parent.depth * BRANCH.step;
    let d: string;
    if (parent.depth === 0) {
      const from = parent.top + parent.node + BRANCH.node;
      const drop = Math.max(14, Math.abs(x - parent.x) * 0.8);
      d = `M${parent.x} ${from} C${parent.x} ${from + drop / 2} ${x} ${from + drop / 2} ${x} ${from + drop}`;
    } else {
      d = `M${x} ${parent.top + parent.height}`;
    }
    children.forEach((child, at) => {
      const y = child.top + child.node;
      const end = BRANCH.content + child.depth * BRANCH.step - BRANCH.gap;
      const bend = y - BRANCH.elbow;
      d += ` V${bend} Q${x} ${y} ${x + BRANCH.elbow} ${y} H${end}`;
      if (at < children.length - 1) d += ` M${x} ${bend}`;
    });
    branches.push({ d, yours: parent.x === LANE.you });
  });
  return branches;
}
