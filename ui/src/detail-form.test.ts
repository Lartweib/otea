import { describe, expect, it } from 'vitest';
import {
  ASIDE_FROM,
  asideHeight,
  composition,
  detailForm,
  detailsCut,
  travelPath,
} from './detail-form.ts';

describe('detailForm', () => {
  it('shows the aside from a 1268px pane: gutters, main, gap and the narrowest aside', () => {
    expect(ASIDE_FROM).toBe(40 + 800 + 48 + 340 + 40);
    expect(detailForm(1268)).toBe('aside');
    expect(detailForm(1548)).toBe('aside');
  });

  it('stacks below it, as on 1440 and 1920 screens with the default list', () => {
    expect(detailForm(1267)).toBe('stacked');
    expect(detailForm(691)).toBe('stacked');
    expect(detailForm(1038)).toBe('stacked');
  });
});

describe('composition', () => {
  // The detail fills the pane: two 40px gutters, then one column, or main, a 48px gap and an aside
  // that takes a quarter of every pixel past the threshold, between 340 and 440.
  it.each([
    [1267, { form: 'stacked', main: 1187 }],
    [1268, { form: 'aside', main: 800, aside: 340 }],
    [1355, { form: 'aside', main: 865, aside: 362 }],
    [1517, { form: 'aside', main: 987, aside: 402 }],
    [1588, { form: 'aside', main: 1040, aside: 420 }],
    [1693, { form: 'aside', main: 1125, aside: 440 }],
    [1748, { form: 'aside', main: 1180, aside: 440 }],
    [2396, { form: 'aside', main: 1828, aside: 440 }],
  ])('a %ipx pane is %j', (pane, expected) => {
    expect(composition(pane)).toEqual(expected);
  });

  it('leaves no band on the right: gutter, main, gap, aside and gutter fill the pane', () => {
    for (const pane of [1268, 1300, 1517, 1693, 2396]) {
      const { main, aside = 0 } = composition(pane);
      expect(40 + main + 48 + aside + 40).toBe(pane);
    }
  });

  it('switches form where detailForm does', () => {
    expect(composition(ASIDE_FROM - 1).form).toBe(detailForm(ASIDE_FROM - 1));
    expect(composition(ASIDE_FROM).form).toBe(detailForm(ASIDE_FROM));
  });
});

describe('detailsCut', () => {
  it('shows every row up to five', () => {
    expect(detailsCut(5, false)).toEqual({ shown: 5, more: 0 });
    expect(detailsCut(3, false)).toEqual({ shown: 3, more: 0 });
  });

  it('from the sixth row, shows five and how many more', () => {
    expect(detailsCut(6, false)).toEqual({ shown: 5, more: 1 });
    expect(detailsCut(7, false)).toEqual({ shown: 5, more: 2 });
  });

  it('shows them all once opened', () => {
    expect(detailsCut(7, true)).toEqual({ shown: 7, more: 0 });
  });
});

describe('asideHeight', () => {
  it('is the room under the aside in the pane', () => {
    expect(asideHeight(1000, 180, 64)).toBe(756);
  });

  it('never goes under 240px', () => {
    expect(asideHeight(400, 300, 64)).toBe(240);
  });
});

describe('travelPath', () => {
  it('to the aside: sideways first (from the main column to the aside), then up', () => {
    // Details sits 872px left of and 600px below where it lands; the main column ends left of it.
    const { xw, t1, t2 } = travelPath(-872, 600, -24, true);
    expect(xw).toBe(0);
    expect(t1).toBeCloseTo(872 / 1472);
    expect(t2).toBe(1);
  });

  it('back: down first while clear of the main column, then sideways', () => {
    const { xw, t1, t2 } = travelPath(872, -600, 824, false);
    expect(xw).toBe(872);
    expect(t1).toBe(0);
    expect(t2).toBeCloseTo(600 / 1472);
  });

  it('back from an aside closer than the clear line: first out to the clear line', () => {
    const { xw, t1 } = travelPath(700, -600, 824, false);
    expect(xw).toBe(824);
    expect(t1).toBeGreaterThan(0);
  });

  it('a section that does not move has a path all the same', () => {
    expect(travelPath(0, 0, 0, true)).toEqual({ xw: 0, t1: 0, t2: 0 });
  });
});
