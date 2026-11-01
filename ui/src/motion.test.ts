import { describe, expect, it } from 'vitest';
import {
  headAt,
  type Placement,
  planMotion,
  revealRadius,
  roomAt,
  treeDuration,
} from './motion.ts';
import type { Turn } from './types.ts';

const row = (top: number, turn: Turn): Placement => ({
  top,
  turn,
  x: turn === 'human' ? 40 : turn === 'agent' ? 16 : 28,
});
const block = (top: number): Placement => ({ top });
const map = (entries: Record<string, Placement>) => new Map(Object.entries(entries));

describe('planMotion', () => {
  it('plans nothing on the first layout', () => {
    expect(planMotion(new Map(), map({ 'A-1': row(0, 'human') }))).toEqual([]);
  });

  it('plans nothing when nothing moved', () => {
    const layout = map({ 'A-1': row(0, 'human'), head: block(56) });
    expect(planMotion(layout, layout)).toEqual([]);
  });

  it('carries a row that changed hands from where it was, across lanes', () => {
    const plan = planMotion(
      map({ 'A-1': row(48, 'agent'), 'A-2': row(152, 'agent') }),
      map({ 'A-1': row(48, 'human'), 'A-2': row(200, 'agent') }),
    );

    expect(plan).toContainEqual({
      key: 'A-1',
      kind: 'carry',
      dy: 0,
      fromX: 16,
      toX: 40,
      toYou: true,
    });
  });

  it('marks a hand-off to the agent as not yours', () => {
    const [motion] = planMotion(
      map({ 'A-1': row(48, 'human') }),
      map({ 'A-1': row(160, 'agent') }),
    );

    expect(motion).toEqual({
      key: 'A-1',
      kind: 'carry',
      dy: -112,
      fromX: 40,
      toX: 16,
      toYou: false,
    });
  });

  it('sinks a row that closed into the trunk and lifts one that reopened', () => {
    const plan = planMotion(
      map({ 'A-1': row(48, 'human'), 'A-2': row(300, 'none') }),
      map({ 'A-1': row(300, 'none'), 'A-2': row(48, 'human') }),
    );

    expect(plan).toEqual([
      { key: 'A-1', kind: 'close', dy: -252, fromX: 40, toX: 28, toYou: false },
      { key: 'A-2', kind: 'reopen', dy: 252, fromX: 28, toX: 40, toYou: true },
    ]);
  });

  it('makes room: every other block that shifted slides from its old place', () => {
    const plan = planMotion(
      map({ 'A-1': row(48, 'human'), head: block(104), 'A-2': row(152, 'agent') }),
      map({ 'A-1': row(48, 'human'), head: block(152), 'A-2': row(200, 'agent') }),
    );

    expect(plan).toEqual([
      { key: 'head', kind: 'room', dy: -48, fromX: 0, toX: 0, toYou: false },
      { key: 'A-2', kind: 'room', dy: -48, fromX: 16, toX: 16, toYou: false },
    ]);
  });

  it('fades in what is new and lets go of what left', () => {
    const plan = planMotion(map({ 'A-1': row(0, 'human') }), map({ 'A-9': row(0, 'agent') }));

    expect(plan).toEqual([{ key: 'A-9', kind: 'enter', dy: 0, fromX: 16, toX: 16, toYou: false }]);
  });
});

describe('treeDuration', () => {
  it('is 180ms plus 70 a row drawn, capped at 600', () => {
    expect(treeDuration(2)).toBe(320);
    expect(treeDuration(4)).toBe(460);
    expect(treeDuration(6)).toBe(600);
    expect(treeDuration(12)).toBe(600);
  });

  it('folds at 0.8 of the unfold', () => {
    expect(treeDuration(2, true)).toBeCloseTo(256);
    expect(treeDuration(6, true)).toBeCloseTo(480);
  });
});

describe('headAt', () => {
  it('runs at constant speed for 60% of the time, covering 75% of the line', () => {
    expect(headAt(0)).toBe(0);
    expect(headAt(0.3)).toBeCloseTo(0.375);
    expect(headAt(0.6)).toBeCloseTo(0.75);
  });

  it('then eases out to the end', () => {
    expect(headAt(0.8)).toBeCloseTo(0.9375);
    expect(headAt(1)).toBe(1);
    expect(headAt(2)).toBe(1);
  });
});

describe('roomAt', () => {
  const knots = [
    [-30, 0],
    [10, 54],
    [64, 108],
  ] as const;

  it('opens nothing before the head leaves the parent', () => {
    expect(roomAt(knots, -40)).toBe(0);
  });

  it('opens each row fully by the time the head reaches its elbow', () => {
    expect(roomAt(knots, 10)).toBe(54);
    expect(roomAt(knots, -10)).toBe(27);
    expect(roomAt(knots, 37)).toBe(81);
    expect(roomAt(knots, 500)).toBe(108);
  });
});

describe('revealRadius', () => {
  it('reaches the farthest corner of the viewport', () => {
    expect(revealRadius(0, 0, 300, 400)).toBe(500);
    expect(revealRadius(1240, 30, 1280, 800)).toBeCloseTo(Math.hypot(1240, 770));
    expect(revealRadius(640, 400, 1280, 800)).toBeCloseTo(Math.hypot(640, 400));
  });

  it('covers the viewport from a point outside it', () => {
    expect(revealRadius(-30, -40, 0, 0)).toBe(50);
  });
});
