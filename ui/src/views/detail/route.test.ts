import { describe, expect, it } from 'vitest';
import { officialType } from '../../derive/fixtures.ts';
import {
  dipsOf,
  futureD,
  labelsShown,
  laneD,
  type RouteStep,
  routeGeom,
  routeIndex,
  routeSteps,
  seg,
  trunkD,
  walkedD,
} from './route.ts';

const bug = officialType('bug-triage');
const steps: RouteStep[] = routeSteps(bug);

describe("the route's steps", () => {
  it('lays the main path on the lanes by whose turn each step is', () => {
    expect(steps).toEqual([
      { name: 'reported', lane: 'you' },
      { name: 'accepted', lane: 'ag' },
      { name: 'fixing', lane: 'ag' },
      { name: 'verify', lane: 'you' },
      { name: 'fixed', lane: 'none' },
    ]);
  });

  it('places an off-path state at the step it belongs to', () => {
    expect(routeIndex(bug, 'verify', [])).toBe(3);
    // needs_info is the agents' and is entered from reported: it sits before it, at step 0.
    expect(routeIndex(bug, 'needs_info', ['reported'])).toBe(0);
  });
});

describe('the route geometry (mock:2615-2629)', () => {
  const g = routeGeom(steps, 3, 'you', 1000);

  it('spreads the steps between 44 and W - 31', () => {
    expect(g.xs).toEqual([44, 275, 507, 738, 969]);
    expect(g.xh).toBe(969);
  });

  it('walks the steps reached, the current one on the lane of who holds it now', () => {
    expect(g.pts).toEqual([
      [44, 64.5],
      [275, 32.5],
      [507, 32.5],
      [738, 64.5],
    ]);
    expect(g.node).toEqual([738, 64.5]);
  });

  it('changes lanes with a 30 px S-curve halfway between two steps', () => {
    expect(seg([44, 64.5], [275, 32.5], false)).toBe('H129.5C154.5 64.5 164.5 32.5 189.5 32.5H275');
    expect(seg([275, 32.5], [507, 32.5], false)).toBe('H507');
  });

  it('fuses into the trunk at the last step', () => {
    expect(seg([738, 64.5], [969, 48.5], true)).toBe('H901C931 64.5 939 48.5 969 48.5');
  });

  it('draws the walked line through every step reached', () => {
    expect(walkedD(g)).toBe(
      'M44 64.5H129.5C154.5 64.5 164.5 32.5 189.5 32.5H275H507H592.5C617.5 32.5 627.5 64.5 652.5 64.5H738',
    );
  });

  it('dashes the future from the node to the end, none once the item is at the end', () => {
    expect(futureD(g)).toBe('M738 64.5H901C931 64.5 939 48.5 969 48.5');
    expect(futureD(routeGeom(steps, 4, 'none', 1000))).toBeNull();
  });

  it('draws the lanes flat into the trunk', () => {
    expect(laneD(969, 32.5)).toBe('M24 32.5H901C931 32.5 939 48.5 969 48.5');
    expect(trunkD(969, 1000)).toBe('M969 48.5H1000');
  });

  it('holds a single step at the start', () => {
    const one = routeGeom([{ name: 'open', lane: 'you' }], 0, 'you', 600);
    expect(one.xs).toEqual([44]);
    expect(walkedD(one)).toBe('M44 64.5');
  });
});

describe('the dips under your lane (mock:2645-2654)', () => {
  const g = routeGeom(steps, 3, 'you', 1000);

  it('draws one dip per round you sent back, 50 px before its step, the next ones 40 px further', () => {
    const dips = dipsOf(g, [
      { at: 3, label: 'round 1 · sent back on Monday' },
      { at: 3, label: 'round 2 · sent back today' },
    ]);
    expect(dips.map((d) => d.x)).toEqual([688, 648]);
    expect(dips[0]?.d).toBe('M674 64.5C674 84 702 84 702 64.5');
    expect(dips.map((d) => d.label)).toEqual(['round 1 · sent back on Monday', undefined]);
  });

  it('dips after the first step, which has no room before it', () => {
    const [dip] = dipsOf(g, [{ at: 0, label: 'x' }]);
    expect(dip?.x).toBe((g.xs[0] ?? 0) + 50);
  });

  it('skips a dip off the path', () => {
    expect(dipsOf(g, [{ at: -1, label: 'x' }])).toEqual([]);
  });
});

describe('the step names over the route', () => {
  const words = ['REPORTADO', 'ACEPTADO', 'EN ARREGLO', 'A VERIFICAR', 'ARREGLADO'];

  it('shows every name when they fit', () => {
    expect(labelsShown([44, 300, 560, 820, 1080], words, 3, 7.9)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('gives way when two would touch, keeping the current step, then the ends', () => {
    // A 440 px wide route beside a narrow sheet: A VERIFICAR (current) and ARREGLADO collide.
    expect(labelsShown([44, 140, 236, 332, 409], words, 3, 6.6)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(labelsShown([44, 140, 236, 332, 409], words, 1, 6.6)).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
  });
});
