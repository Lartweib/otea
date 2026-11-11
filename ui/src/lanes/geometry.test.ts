import { describe, expect, it } from 'vitest';
import { type LaneParams, laneOf, laneParams, lanePaths, type RowGeom, X } from './geometry.ts';

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
    });
  });

  it('keeps 24 px between the last open row and the fuse', () => {
    const p = laneParams([row('A', 40, 'you', 'yours'), row('E', 80, 'none', 'done')], 300, 600);
    expect(p.fuseAt).toBe(100.5);
    expect(p.lastOpen).toBe(76.5);
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
