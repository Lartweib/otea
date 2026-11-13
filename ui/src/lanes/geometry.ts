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

// A stretch of closed rows with open rows below it (a list grouped by a field keeps closed rows
// inside its groups): both lanes bend into the trunk at its first node (`at`) and out of it after its
// last (`end`). in: where the lanes leave their straight run to bend in (null when the list opens on
// the stretch: the lanes start in the trunk); out: where they are straight again, before the next
// open row's node.
export type Pinch = { in: number | null; at: number; end: number; out: number };

// ys: your nodes; ws: stuck nodes; as: working agent nodes. pinches: top to bottom.
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
  pinches: Pinch[];
};

// The bend into the trunk is never shorter than this (the end-of-list fusion's own minimum).
const BEND = 24;

// The pinches of a list: each stretch of consecutive closed rows that an open row follows. The bend
// in starts where the end-of-list fusion would (the open row's foot less 6); the bend out mirrors it
// about the next open row's node, so its light runs on a straight lane.
function pinchesOf(rows: readonly RowGeom[]): Pinch[] {
  const live = rows.filter((r) => !r.ghost).sort((a, b) => a.top - b.top);
  const pinches: Pinch[] = [];
  let prev: RowGeom | null = null;
  let stretch: RowGeom[] = [];
  for (const r of live) {
    if (r.lane === 'none') {
      stretch.push(r);
      continue;
    }
    const first = stretch[0];
    const last = stretch.at(-1);
    if (first && last) {
      const at = first.top + first.off;
      const end = last.top + last.off;
      const ny = r.top + r.off;
      const foot = r.top + r.height - 6;
      pinches.push({
        in: prev ? Math.min(prev.top + prev.height - 6, at - BEND) : null,
        at,
        end,
        out: Math.min(ny, Math.max(end + BEND, ny - (foot - ny))),
      });
    }
    stretch = [];
    prev = r;
  }
  return pinches;
}

export function laneParams(
  rows: readonly RowGeom[],
  H: number,
  W: number,
  atasco = false,
): LaneParams {
  let lastOpen = 0;
  let firstClosed: number | null = null;
  let anyClosed = false;
  const ys: number[] = [];
  const ws: number[] = [];
  const as: number[] = [];
  // The lanes fuse for good below the last open row; closed rows above it pinch them (pinchesOf).
  let lastOpenTop = Number.NEGATIVE_INFINITY;
  for (const r of rows)
    if (!r.ghost && r.lane !== 'none') lastOpenTop = Math.max(lastOpenTop, r.top);
  for (const r of rows) {
    if (r.ghost) continue;
    const y = r.top + r.off;
    if (r.lane === 'none') {
      anyClosed = true;
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
    lastOpen: Math.min(Math.round(lastOpen), fuseAt - BEND),
    fuseAt,
    closed: anyClosed,
    y0: ys.length ? Math.min(...ys) : null,
    y1: ys.length ? Math.max(...ys) : null,
    ys,
    ws,
    as,
    atasco,
    pinches: pinchesOf(rows),
  };
}

export type LanePaths = {
  ag: string;
  you: string;
  trunk: string;
  trunkStroke: 'var(--closed)' | 'var(--lane)';
};

const bendIn = (x: number, from: number, to: number) => {
  const m = (from + to) / 2;
  return `V${from}C${x} ${m} ${X.none} ${m} ${X.none} ${to}`;
};
const bendOut = (x: number, from: number, to: number) => {
  const m = (from + to) / 2;
  return `M${X.none} ${from}C${X.none} ${m} ${x} ${m} ${x} ${to}`;
};

// Both lanes run down to the last open row, bend into the trunk at the fuse, and the trunk runs on.
// At each pinch they bend into the trunk the same way, and out of it again (its mirror).
export function lanePaths(p: LaneParams): LanePaths {
  const lane = (x: number) => {
    let d = `M${x} 0`;
    for (const k of p.pinches) {
      d = k.in === null ? '' : `${d}${bendIn(x, k.in, k.at)}`;
      d += bendOut(x, k.end, k.out);
    }
    return d + bendIn(x, p.lastOpen, p.fuseAt);
  };
  const stretches = p.pinches.map((k) => `M${X.none} ${k.in === null ? 0 : k.at}V${k.end}`);
  return {
    ag: lane(X.ag),
    you: lane(X.you),
    trunk: `${stretches.join('')}M${X.none} ${p.fuseAt}V${p.H}`,
    trunkStroke: p.closed ? 'var(--closed)' : 'var(--lane)',
  };
}

// The point of the trunk nearest a height: where a row closing at that height sinks.
export function trunkAt(p: LaneParams, y: number): number {
  const spans: [number, number][] = [
    ...p.pinches.map((k): [number, number] => [k.in === null ? 0 : k.at, k.end]),
    [p.fuseAt, p.H],
  ];
  let best = p.fuseAt;
  let dist = Number.POSITIVE_INFINITY;
  for (const [a, b] of spans) {
    const at = Math.min(Math.max(y, a), b);
    if (Math.abs(at - y) < dist) {
      dist = Math.abs(at - y);
      best = at;
    }
  }
  return best;
}

// The pinches between two drawings of a list (a handoff): matched one to one while their number holds,
// else the old ones until halfway and the new ones after (as the trunk's colour turns).
export function lerpPinches(a: readonly Pinch[], b: readonly Pinch[], t: number): Pinch[] {
  if (a.length !== b.length) return [...(t > 0.5 ? b : a)];
  const l = (x: number, y: number) => x + (y - x) * t;
  return b.map((kb, i) => {
    const ka = a[i] as Pinch;
    return {
      in: ka.in === null || kb.in === null ? kb.in : l(ka.in, kb.in),
      at: l(ka.at, kb.at),
      end: l(ka.end, kb.end),
      out: l(ka.out, kb.out),
    };
  });
}
