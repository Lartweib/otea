import { describe, expect, it } from 'vitest';
import {
  type LaneParams,
  laneOf,
  laneParams,
  lanePaths,
  lerpPinches,
  type RowGeom,
  trunkAt,
  X,
} from './geometry.ts';

const row = (key: string, top: number, lane: RowGeom['lane'], look: RowGeom['look']): RowGeom => ({
  key,
  top,
  height: 50,
  off: 19.5,
  lane,
  look,
});

describe('the lanes', () => {
  it('runs the agents at 16.5, you at 40.5 and the closed trunk between them', () => {
    expect(X).toEqual({ ag: 16.5, you: 40.5, none: 28.5 });
    expect(laneOf('human')).toBe('you');
    expect(laneOf('agent')).toBe('ag');
    expect(laneOf('none')).toBe('none');
  });

  it('measures where the open lanes end, where they fuse, and the lit nodes', () => {
    const p = laneParams(
      [
        row('A', 40, 'you', 'yours'),
        row('B', 90, 'ag', 'working'),
        row('C', 140, 'ag', 'stuck'),
        row('D', 190, 'ag', 'queued'),
        row('E', 300, 'none', 'done'),
        row('F', 350, 'none', 'dropped'),
        { ...row('G', 999, 'you', 'yours'), ghost: true },
      ],
      420,
      700,
    );
    expect(p).toEqual<LaneParams>({
      H: 420,
      W: 700,
      lastOpen: 234,
      fuseAt: 320.5,
      closed: true,
      y0: 59.5,
      y1: 59.5,
      ys: [59.5],
      ws: [159.5],
      as: [109.5],
      atasco: false,
      pinches: [],
    });
  });

  it('keeps 24 px between the last open row and the fuse', () => {
    const p = laneParams([row('A', 40, 'you', 'yours'), row('E', 80, 'none', 'done')], 300, 600);
    expect(p.fuseAt).toBe(100.5);
    expect(p.lastOpen).toBe(76.5);
  });

  it('pinches both lanes into the trunk at a closed row with open rows below, and splits them again', () => {
    // A list grouped by a field: closed rows sit inside the groups, among the open ones.
    const p = laneParams(
      [
        row('A', 40, 'you', 'yours'),
        row('B', 100, 'none', 'dropped'),
        row('C', 200, 'ag', 'queued'),
      ],
      300,
      700,
    );
    // In: the open row's foot less 6 (as at the end); out: its mirror about the next open node.
    expect(p.pinches).toEqual([{ in: 84, at: 119.5, end: 119.5, out: 195 }]);
    expect(p.lastOpen).toBe(244);
    expect(p.fuseAt).toBe(284.5);
    expect(p.closed).toBe(true);
    expect(lanePaths(p)).toEqual({
      ag: 'M16.5 0V84C16.5 101.75 28.5 101.75 28.5 119.5M28.5 119.5C28.5 157.25 16.5 157.25 16.5 195V244C16.5 264.25 28.5 264.25 28.5 284.5',
      you: 'M40.5 0V84C40.5 101.75 28.5 101.75 28.5 119.5M28.5 119.5C28.5 157.25 40.5 157.25 40.5 195V244C40.5 264.25 28.5 264.25 28.5 284.5',
      trunk: 'M28.5 119.5V119.5M28.5 284.5V300',
      trunkStroke: 'var(--closed)',
    });
  });

  it('keeps closed rows in a row fused as one stretch of trunk, splitting only before the next open row', () => {
    const p = laneParams(
      [
        row('A', 0, 'ag', 'queued'),
        row('B', 60, 'none', 'done'),
        row('C', 120, 'none', 'dropped'),
        row('D', 200, 'you', 'yours'),
        row('E', 300, 'none', 'done'),
      ],
      400,
      700,
    );
    expect(p.pinches).toEqual([{ in: 44, at: 79.5, end: 139.5, out: 195 }]);
    expect(p.fuseAt).toBe(320.5);
    expect(lanePaths(p).trunk).toBe('M28.5 79.5V139.5M28.5 320.5V400');
  });

  it('starts the lanes in the trunk when the list opens on closed rows', () => {
    const p = laneParams([row('B', 0, 'none', 'done'), row('C', 100, 'ag', 'queued')], 200, 700);
    expect(p.pinches).toEqual([{ in: null, at: 19.5, end: 19.5, out: 95 }]);
    const paths = lanePaths(p);
    expect(paths.ag).toBe(
      'M28.5 19.5C28.5 57.25 16.5 57.25 16.5 95V144C16.5 164.25 28.5 164.25 28.5 184.5',
    );
    expect(paths.trunk).toBe('M28.5 0V19.5M28.5 184.5V200');
  });

  it('moves the pinches with their rows through a handoff, and swaps them halfway when their number changes', () => {
    const a = [{ in: 84, at: 119.5, end: 119.5, out: 195 }];
    const b = [{ in: 184, at: 219.5, end: 279.5, out: 295 }];
    expect(lerpPinches(a, b, 0.5)).toEqual([{ in: 134, at: 169.5, end: 199.5, out: 245 }]);
    expect(lerpPinches(a, [], 0.4)).toEqual(a);
    expect(lerpPinches(a, [], 0.6)).toEqual([]);
    expect(lerpPinches([{ ...a[0], in: null } as never], b, 0.5)[0]?.in).toBe(184);
  });

  it('finds the nearest point of the trunk for a row sinking into it', () => {
    const p = laneParams(
      [
        row('A', 40, 'you', 'yours'),
        row('B', 100, 'none', 'dropped'),
        row('C', 200, 'ag', 'queued'),
        row('D', 300, 'none', 'done'),
      ],
      400,
      700,
    );
    expect(trunkAt(p, 110)).toBe(119.5);
    expect(trunkAt(p, 230)).toBe(320.5);
    expect(trunkAt(p, 170)).toBe(119.5);
    expect(trunkAt(laneParams([row('A', 0, 'ag', 'queued')], 200, 700), 30)).toBe(184.5);
  });

  it('fuses at the foot when nothing closed is listed, and lights nothing in Atasco but the stuck', () => {
    const p = laneParams([row('A', 0, 'ag', 'stuck')], 200, 600, true);
    expect(p.fuseAt).toBe(184.5);
    expect(p.closed).toBe(false);
    expect(p.y0).toBeNull();
    expect(p.atasco).toBe(true);
  });

  it('draws both lanes down to the fuse and the trunk from there', () => {
    const p = laneParams([row('A', 40, 'you', 'yours'), row('E', 300, 'none', 'done')], 420, 700);
    const mid = (p.lastOpen + p.fuseAt) / 2;
    expect(lanePaths(p)).toEqual({
      ag: `M16.5 0V${p.lastOpen}C16.5 ${mid} 28.5 ${mid} 28.5 ${p.fuseAt}`,
      you: `M40.5 0V${p.lastOpen}C40.5 ${mid} 28.5 ${mid} 28.5 ${p.fuseAt}`,
      trunk: `M28.5 ${p.fuseAt}V420`,
      trunkStroke: 'var(--closed)',
    });
    expect(lanePaths(laneParams([], 100, 100)).trunkStroke).toBe('var(--lane)');
  });
});
