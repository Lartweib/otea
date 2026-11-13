import { describe, expect, it } from 'vitest';
import { changesShape, flipStart } from './flip.ts';

// A FLIP starts each leaf where it stood. A rule (data-leaf="w") also starts at its old width, so it
// stretches with the column it underlines instead of snapping to its new length.
describe('where a leaf starts its FLIP', () => {
  const a = { left: 600, top: 80, width: 1040 };

  it('starts a leaf where it stood, at the size its text showed', () => {
    expect(flipStart(a, { left: 300, top: 70, width: 1040 }, 1, false)).toBe(
      'translate(300px, 10px) scale(1)',
    );
    expect(flipStart(a, { left: 600, top: 80, width: 1040 }, 1.2, false)).toBe(
      'translate(0px, 0px) scale(1.2)',
    );
  });

  it('starts a rule at its old width', () => {
    expect(flipStart(a, { left: 300, top: 80, width: 520 }, 1, true)).toBe(
      'translate(300px, 0px) scale(2, 1)',
    );
  });

  it('leaves alone a leaf that did not move', () => {
    expect(flipStart(a, a, 1, true)).toBeNull();
    expect(flipStart(a, { left: 600.2, top: 80, width: 1040 }, 1, false)).toBeNull();
  });
});

// A tool that gains or loses its label as the list widens or narrows (sweep #6): sliding it at its
// new width from where it stood would draw it over its neighbour, so it changes in place instead.
describe('a leaf that changes shape', () => {
  it('is one whose width changes', () => {
    expect(
      changesShape({ left: 579, top: 279, width: 82 }, { left: 1150, top: 287, width: 150 }),
    ).toBe(true);
    expect(
      changesShape({ left: 671, top: 279, width: 82 }, { left: 640, top: 287, width: 40 }),
    ).toBe(true);
  });

  it('is not one that only moves', () => {
    expect(
      changesShape({ left: 731, top: 279, width: 28 }, { left: 1356, top: 287, width: 28.5 }),
    ).toBe(false);
  });
});
