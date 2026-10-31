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

// Branches: a parent's children hang from it in a quiet tree inside the content column, off the
// lanes: the lanes mean turn, the branch means hierarchy, and the two never touch. The branch starts
// 6px below the parent's type icon, on the icon's centre, drops straight down and turns into each
// child with the elbow, its leg on the child's icon centre, ending 8px before the icon. It is drawn
// the same for a parent on either lane. Geometry shared with list.css: row content starts at x=68,
// steps 28px a level, and its icon is 16px (14px for a child) centred on the row's node line.
export const BRANCH = { content: 68, step: 28, elbow: 8, gap: 8, below: 6 } as const;

const iconSize = (depth: number) => (depth === 0 ? 16 : 14);

// Where a row's icon starts, at its depth.
export function iconX(depth: number): number {
  return BRANCH.content + depth * BRANCH.step;
}

// A row as the branches see it: where it sits, how far down its icon centre is, and how deep it
// nests.
export type BranchRow = { top: number; height: number; node: number; depth: number };

export function layoutBranches(rows: readonly BranchRow[]): string[] {
  const branches: string[] = [];
  rows.forEach((parent, index) => {
    const children: BranchRow[] = [];
    for (const row of rows.slice(index + 1)) {
      if (row.depth <= parent.depth) break;
      if (row.depth === parent.depth + 1) children.push(row);
    }
    if (children.length === 0) return;
    const size = iconSize(parent.depth);
    const x = iconX(parent.depth) + size / 2;
    let d = `M${x} ${parent.top + parent.node + size / 2 + BRANCH.below}`;
    children.forEach((child, at) => {
      const y = child.top + child.node;
      const bend = y - BRANCH.elbow;
      d += ` V${bend} Q${x} ${y} ${x + BRANCH.elbow} ${y} H${iconX(child.depth) - BRANCH.gap}`;
      if (at < children.length - 1) d += ` M${x} ${bend}`;
    });
    branches.push(d);
  });
  return branches;
}
