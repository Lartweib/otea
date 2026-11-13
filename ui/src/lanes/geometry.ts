import type { Turn } from '../types.ts';
import type { Look } from './looks.ts';

// The lanes of a list (SPEC §4.1, mock:1005, 1829-1859): the agents' lane, yours, and the trunk
// they fuse into where closed work starts.
export type Lane = 'ag' | 'you' | 'none';

export const X: Record<Lane, number> = { ag: 16.5, you: 40.5, none: 28.5 };

export function laneOf(turn: Turn): Lane {
  return turn === 'human' ? 'you' : turn === 'agent' ? 'ag' : 'none';
}

// A row as measured in its list: its top and height, its node's y inside it (--pt + --lh / 2).
export type RowGeom = {
  key: string;
  top: number;
  height: number;
  off: number;
  lane: Lane;
  look: Look;
  ghost?: boolean;
};

// ys: your nodes; ws: stuck nodes; as: working agent nodes.
export type LaneParams = {
  H: number;
  W: number;
  lastOpen: number;
  fuseAt: number;
  closed: boolean;
  y0: number | null;
  y1: number | null;
  ys: number[];
  ws: number[];
  as: number[];
  atasco: boolean;
};

export function laneParams(
  rows: readonly RowGeom[],
  H: number,
  W: number,
  atasco = false,
): LaneParams {
  let lastOpen = 0;
  let firstClosed: number | null = null;
  const ys: number[] = [];
  const ws: number[] = [];
  const as: number[] = [];
  // The lanes fuse below the last open row: a closed row listed above an open one (a list grouped by
  // a field keeps closed rows inside its groups) sits between the lanes, which run on past it.
  let lastOpenTop = Number.NEGATIVE_INFINITY;
  for (const r of rows)
    if (!r.ghost && r.lane !== 'none') lastOpenTop = Math.max(lastOpenTop, r.top);
  for (const r of rows) {
    if (r.ghost) continue;
    const y = r.top + r.off;
    if (r.lane === 'none') {
      if (r.top > lastOpenTop && (firstClosed == null || y < firstClosed)) firstClosed = y;
    } else lastOpen = Math.max(lastOpen, r.top + r.height - 6);
    if (r.lane === 'you') ys.push(y);
    if (r.look === 'stuck') ws.push(y);
    else if (r.lane === 'ag' && r.look === 'working') as.push(y);
  }
  const fuseAt = Math.round(firstClosed ?? H - 16) + 0.5;
  return {
    H,
    W,
    lastOpen: Math.min(Math.round(lastOpen), fuseAt - 24),
    fuseAt,
    closed: firstClosed != null,
    y0: ys.length ? Math.min(...ys) : null,
    y1: ys.length ? Math.max(...ys) : null,
    ys,
    ws,
    as,
    atasco,
  };
}

export type LanePaths = {
  ag: string;
  you: string;
  trunk: string;
  trunkStroke: 'var(--closed)' | 'var(--lane)';
};

// Both lanes run down to the last open row, bend into the trunk at the fuse, and the trunk runs on.
export function lanePaths(p: LaneParams): LanePaths {
  const mid = (p.lastOpen + p.fuseAt) / 2;
  const fuse = (x: number) =>
    `M${x} 0V${p.lastOpen}C${x} ${mid} ${X.none} ${mid} ${X.none} ${p.fuseAt}`;
  return {
    ag: fuse(X.ag),
    you: fuse(X.you),
    trunk: `M${X.none} ${p.fuseAt}V${p.H}`,
    trunkStroke: p.closed ? 'var(--closed)' : 'var(--lane)',
  };
}
