import type { Turn } from './types.ts';

// Lane geometry of the list gutter (56px wide): agent lane left, your lane right, closed items on the trunk.
export const LANE = { agent: 16, trunk: 28, you: 40 } as const;

export function laneX(turn: Turn): number {
  if (turn === 'human') return LANE.you;
  if (turn === 'agent') return LANE.agent;
  return LANE.trunk;
}

// A block is one stacked slice of the list: a row (it has a turn) or anything else (headings, notes).
// node is how far below its top a row draws its node: the centre, unless the row is unfolded.
export type Block = { height: number; turn?: Turn; node?: number };

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
  for (const { height, turn, node = height / 2 } of blocks) {
    if (turn) {
      const y = top + node;
      rows.push({ y, x: laneX(turn) });
      // An open row keeps the lanes straight as far past its bottom as its node sits below its top.
      if (turn === 'none') firstClosed ??= y;
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
