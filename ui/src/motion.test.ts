import { describe, expect, it } from 'vitest';
import { type Placement, planMotion } from './motion.ts';
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
