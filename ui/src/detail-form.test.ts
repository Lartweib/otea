import { describe, expect, it } from 'vitest';
import { ASIDE_FROM, asideHeight, detailForm, travelPath } from './detail-form.ts';

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
