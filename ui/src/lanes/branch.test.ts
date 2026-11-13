import { describe, expect, it } from 'vitest';
import { legTop, shiftOf } from './branch.ts';

// A branch is measured from the titles' left edges. A row that is still sliding in (the list's
// draw-in, the view morph's resolve) is translated a few pixels; the branch is drawn for where the
// row stands, not for where it is passing, or it jumps when the slide ends.
describe('the shift a row is passing through', () => {
  it('is nothing when the row stands still', () => {
    expect(shiftOf('none')).toBe(0);
    expect(shiftOf('')).toBe(0);
  });

  it('is the horizontal translation of a 2D matrix', () => {
    expect(shiftOf('matrix(1, 0, 0, 1, -4, 0)')).toBe(-4);
    expect(shiftOf('matrix(1, 0, 0, 1, -1.25, 3)')).toBe(-1.25);
  });

  it('is the horizontal translation of a 3D matrix', () => {
    expect(shiftOf('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2.5, 0, 0, 1)')).toBe(-2.5);
  });
});

// The branch leaves its parent under the parent's meta line (its id, its step), never through it.
describe('where a parent’s branch starts', () => {
  it('is just under the meta line', () => {
    // a row at 400 whose node is 19.5 down and whose meta line ends 52 down
    expect(legTop(400, 19.5, 52)).toBe(454);
  });

  it('is never above 10 px under the node', () => {
    expect(legTop(400, 19.5, 20)).toBe(429.5);
  });

  it('is 10 px under the node in a row without a meta line', () => {
    expect(legTop(400, 19.5, null)).toBe(429.5);
  });
});
