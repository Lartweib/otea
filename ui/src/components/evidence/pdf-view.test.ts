import { describe, expect, it } from 'vitest';
import { pageInView, pageScale, ZOOM_MAX, ZOOM_MIN, zoomIn, zoomOut } from './pdf-view.ts';

describe('a PDF read as its pages', () => {
  it('fits a page to the width it has, then zooms from there', () => {
    // An A4 page is 595 points wide.
    expect(pageScale(595, 595, 1)).toBe(1);
    expect(pageScale(595, 350, 1)).toBeCloseTo(350 / 595);
    expect(pageScale(595, 350, 2)).toBeCloseTo((2 * 350) / 595);
  });

  it('never draws a page narrower than a sliver when its box has not been measured', () => {
    expect(pageScale(595, 0, 1)).toBeGreaterThan(0);
  });

  it('zooms in and out by steps, within its limits', () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    // From a zoom between steps, the next step.
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1.1)).toBe(1);
  });

  it('says which page is read: the one that shows the most', () => {
    expect(pageInView([0, 0.2, 0.9, 0.1])).toBe(3);
    expect(pageInView([])).toBe(1);
    expect(pageInView([0, 0])).toBe(1);
  });
});
