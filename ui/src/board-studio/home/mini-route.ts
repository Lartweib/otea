import type { BoardDefinition, Doer, Reviewer } from '../../../../src/core/board/model.ts';

// A board's small route on Studio's home and in the new board dialog (the mock's miniRoute): the
// board's steps ARE its two lanes laid flat. The agents' lane above, yours below, both fusing into
// the closed trunk at Hecho. The walk starts at the creation form, between the lanes; each step
// sits on the lane of whoever does it, and a review by the other side visits that lane before the
// next stop. Drawn in a space 1/0.42 times wider than it shows, so the strokes stay fine.

export const MINI_LANES = { ag: 46, you: 86, mid: 66 } as const;
const SCALE = 0.42;
const HEIGHT = 46;
const X0 = 40;
const PAD = 22;
const LANE_X = 10;

export type MiniNode = { x: number; y: number; kind: 'ag' | 'you' | 'review' | 'done' };

export type MiniRoute = {
  width: number;
  height: number;
  viewW: number;
  viewBox: string;
  lanes: { ag: string; you: string; trunk: string };
  points: Array<[number, number]>;
  walked: string;
  nodes: MiniNode[];
};

const laneOf = (who: Doer | Reviewer): number => (who === 'you' ? MINI_LANES.you : MINI_LANES.ag);
const r1 = (n: number) => Math.round(n * 10) / 10;

// One stretch of the walk: straight along a lane, or an S from one lane to the other.
function seg([px, py]: [number, number], [x, y]: [number, number]): string {
  if (Math.abs(py - y) < 0.5) return `H${r1(x)}`;
  const m = (px + x) / 2;
  const w = Math.min(30, (x - px) / 2 - 2);
  return `H${r1(m - w)}C${r1(m - w / 4)} ${py} ${r1(m + w / 4)} ${y} ${r1(m + w)} ${y}H${r1(x)}`;
}

export function miniRoute(def: BoardDefinition, width = 196): MiniRoute {
  const viewW = width / SCALE;
  const xd = viewW - PAD;
  const n = def.steps.length;
  const col = (xd - X0) / (n + 1);
  const points: Array<[number, number]> = [[X0, MINI_LANES.mid]];
  const nodes: MiniNode[] = [];
  def.steps.forEach((step, i) => {
    const x = Math.round(X0 + col * (i + 1));
    const y = laneOf(step.doer);
    points.push([x, y]);
    nodes.push({ x, y, kind: y === MINI_LANES.you ? 'you' : 'ag' });
    if (step.reviewer === 'none') return;
    const ry = laneOf(step.reviewer);
    const rx = Math.round(x + col * 0.42);
    if (ry !== y) points.push([rx, ry]);
    if (step.reviewer === 'you') nodes.push({ x: rx, y: ry, kind: 'review' });
  });
  points.push([xd, MINI_LANES.mid]);
  nodes.push({ x: xd, y: MINI_LANES.mid, kind: 'done' });
  let walked = `M${points[0]?.[0]} ${points[0]?.[1]}`;
  for (let i = 1; i < points.length; i++)
    walked += seg(points[i - 1] as [number, number], points[i] as [number, number]);
  const fuse = (y: number) =>
    `M${LANE_X} ${y}H${r1(xd - 68)}C${r1(xd - 38)} ${y} ${r1(xd - 30)} ${MINI_LANES.mid} ${r1(xd)} ${MINI_LANES.mid}`;
  return {
    width,
    height: HEIGHT,
    viewW,
    viewBox: `0 ${MINI_LANES.ag - 18} ${r1(viewW)} ${r1(HEIGHT / SCALE)}`,
    lanes: {
      ag: fuse(MINI_LANES.ag),
      you: fuse(MINI_LANES.you),
      trunk: `M${r1(xd)} ${MINI_LANES.mid}H${r1(viewW)}`,
    },
    points,
    walked,
    nodes,
  };
}
