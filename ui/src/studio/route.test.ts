import { describe, expect, it } from 'vitest';
import { officialType } from '../derive/fixtures.ts';
import { namedSteps, RY, routeOf, routeSteps } from './route.ts';

// A template's way of working at a glance: its main path on the two lanes laid flat, as the item's
// route draws it (mock:2613-2667), at the size of a row.
const BUG = [
  { name: 'reported', label: 'reported', lane: 'you' },
  { name: 'accepted', label: 'accepted', lane: 'ag' },
  { name: 'fixing', label: 'fixing', lane: 'ag' },
  { name: 'verify', label: 'verify', lane: 'you' },
  { name: 'fixed', label: 'fixed', lane: 'none' },
] as const;

describe('the steps of a template', () => {
  it('walks its main path, each step on the lane of whose turn it is', () => {
    expect(
      routeSteps(officialType('bug-triage')).map(({ name, lane }) => `${name}:${lane}`),
    ).toEqual(['reported:you', 'accepted:ag', 'fixing:ag', 'verify:you', 'fixed:none']);
  });
});

describe('the route of a template', () => {
  const r = routeOf([...BUG], 360);

  it('spreads the steps from the lane names to the right edge', () => {
    expect(r.xs[0]).toBe(30);
    expect(r.xs.at(-1)).toBe(352);
    expect(r.stops.map(([, y]) => y)).toEqual([RY.you, RY.ag, RY.ag, RY.you, RY.none]);
  });

  it('walks one line, changing lanes on a smooth S between two steps', () => {
    expect(r.walked.startsWith(`M30 ${RY.you}`)).toBe(true);
    expect(r.walked.match(/C/g)?.length).toBe(3);
    expect(r.walked.endsWith(`352 ${RY.none}`)).toBe(true);
  });

  it('fuses both lanes into the closed trunk at the last step', () => {
    expect(r.ag).toMatch(new RegExp(`^M18 ${RY.ag}H`));
    expect(r.ag.endsWith(`352 ${RY.none}`)).toBe(true);
    expect(r.you.endsWith(`352 ${RY.none}`)).toBe(true);
    expect(r.trunk).toBe(`M352 ${RY.none}H360`);
  });

  it('keeps the lanes running when the path never closes', () => {
    const open = routeOf([BUG[0], BUG[1]], 200);
    expect(open.ag).toBe(`M18 ${RY.ag}H200`);
    expect(open.trunk).toBe('');
  });

  it('draws a single step as one stop', () => {
    const one = routeOf([BUG[0]], 200);
    expect(one.xs).toEqual([30]);
    expect(one.walked).toBe(`M30 ${RY.you}`);
  });
});

describe('the names over a route', () => {
  it('keeps every name while they fit', () => {
    expect(namedSteps([30, 110, 190], ['to do', 'doing', 'done'])).toEqual([true, true, true]);
  });

  // Measured as the spaced capitals they are drawn in: EN ARREGLO gives way to A VERIFICAR.
  it('keeps the ends, yours and then the rest, dropping a name that would touch a kept one', () => {
    const xs = [30, 100, 170, 240, 310];
    const labels = ['reportado', 'aceptado', 'en arreglo', 'a verificar', 'arreglado'];
    expect(namedSteps(xs, labels, [false, false, false, true, false])).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
  });
});
