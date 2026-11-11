import { describe, expect, it } from 'vitest';
import { F } from '../motion/curves.ts';
import {
  type CarryGeom,
  FOLD,
  handoffClock,
  plegarPose,
  progressAt,
  UNFOLD,
} from './handoff-pose.ts';

// Every frame of the handoff is a pure function of its time (mock:2152-2251).

const g = (o: Partial<CarryGeom> = {}): CarryGeom => ({
  dy0: -200,
  dy1: 0,
  xa: 40.5,
  xb: 16.5,
  xc: 16.5,
  h: 50,
  w: 700,
  off: 19.5,
  ct: 300,
  preVirtual: false,
  postVirtual: false,
  arrive: false,
  ...o,
});

describe('the clock', () => {
  it('travels on the longest carry, folds and unfolds around it ', () => {
    expect(handoffClock([])).toEqual({ T: 480, FA: 0, Cc: 0, total: 480 });
    const c = handoffClock([100, -400]);
    expect(c.T).toBeCloseTo(480 + 28 * 20);
    expect(c).toMatchObject({ FA: FOLD, Cc: UNFOLD, total: FOLD + c.T + UNFOLD });
    expect(FOLD).toBe(420);
    expect(UNFOLD).toBe(460);
  });

  it('moves rows on settle after the fold, the rooms 40 ms behind', () => {
    expect(progressAt(0, 420, 600).p).toBe(0);
    expect(progressAt(420 + 300, 420, 600).p).toBeCloseTo(F.settle(0.5));
    expect(progressAt(420 + 300, 420, 600).pr).toBeCloseTo(F.settle(260 / 600));
    expect(progressAt(420 + 600, 420, 600)).toMatchObject({ p: 1, s: 1 });
  });
});

describe('Plegar', () => {
  const T = 600;
  it('starts at the starting pose: the whole row where it was, no light yet', () => {
    const f = plegarPose(0, T, g());
    expect(f.y).toBe(-200);
    expect(f.lift).toEqual({ opacity: 1, clip: [0, 0] });
    expect(f.pulse.o).toBe(0);
    expect(f.line.o).toBe(0);
    expect(f.nodeDx).toBe(24);
    expect(f.mix).toBe(0);
    expect(f.newLook).toBe(0);
  });

  it('folds the row into a line at its node, the line absorbed into the node', () => {
    const mid = plegarPose(200, T, g());
    expect(mid.lift.opacity).toBe(1);
    expect(mid.lift.clip?.[0]).toBeGreaterThan(0);
    expect(mid.lift.clip?.[0]).toBeLessThan(19.5);
    expect(mid.line.o).toBeGreaterThan(0);
    expect(mid.line.w).toBeCloseTo(700 - 40.5 - 16);
    const late = plegarPose(330, T, g());
    expect(late.line.w).toBeLessThan(mid.line.w);
    expect(late.pulse.o).toBeGreaterThan(0);
    const folded = plegarPose(419, T, g());
    expect(folded.lift.opacity).toBe(0);
    expect(folded.line.w).toBeLessThan(1);
    expect(folded.pulse.o).toBeCloseTo(1, 2);
  });

  it('travels: the pulse rides the node, changes colour, trails up to 46 px', () => {
    const half = plegarPose(FOLD + T * 0.2, T, g());
    expect(half.lift.opacity).toBe(0);
    expect(half.y).toBeCloseTo(-200 * (1 - F.settle(0.2)));
    expect(half.mix).toBeGreaterThan(0);
    expect(half.mix).toBeLessThan(1);
    expect(half.trail).toBeGreaterThan(30);
    expect(half.pulse).toMatchObject({ o: 1, s: 1 });
    expect(half.pulse.y).toBeCloseTo(300 + 19.5 + half.y - 3);
  });

  it('unfolds out of a line that grows from the node, the pulse blooming as it lands', () => {
    const land = plegarPose(FOLD + T + 110, T, g());
    expect(land.mix).toBe(1);
    expect(land.newLook).toBe(1);
    expect(land.pulse.s).toBeGreaterThan(1);
    expect(land.pulse.o).toBeLessThan(1);
    expect(land.line.w).toBeGreaterThan(0);
    expect(land.trail).toBe(0);
    const end = plegarPose(FOLD + T + UNFOLD, T, g());
    expect(end.y).toBe(0);
    expect(end.lift).toEqual({ opacity: 1, clip: [0, 0] });
    expect(end.pulse.o).toBe(0);
    expect(end.line.o).toBe(0);
    expect(end.nodeDx).toBe(0);
    expect(end.mark).toBe(true);
  });

  it('breathes on the destination lane near the end of the travel', () => {
    expect(plegarPose(FOLD + T * 0.9, T, g()).breath).toBe(false);
    expect(plegarPose(FOLD + T * 0.93, T, g()).breath).toBe(true);
  });

  it('has no row to fold from a virtual start, and none to unfold into a virtual end', () => {
    const arrive = g({ preVirtual: true, arrive: true, dy0: 0, xa: 16.5, xb: 40.5, xc: 40.5 });
    const f0 = plegarPose(0, T, arrive);
    expect(f0.lift.opacity).toBe(0);
    expect(f0.line.o).toBe(0);
    expect(plegarPose(60, T, arrive).pulse.o).toBeGreaterThan(0);
    const sink = g({ postVirtual: true });
    expect(plegarPose(FOLD + T + 200, T, sink).lift.opacity).toBe(0);
    expect(plegarPose(FOLD + T + 200, T, sink).line.o).toBe(0);
  });

  it('keeps a row that was already folded folded, when a new handoff takes it over', () => {
    const f = plegarPose(0, T, g({ folded: true }));
    expect(f.lift.opacity).toBe(0);
    expect(f.line.o).toBe(0);
    expect(f.pulse.o).toBe(1);
  });
});
