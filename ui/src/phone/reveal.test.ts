import { describe, expect, it } from 'vitest';
import { hiddenBelow } from './reveal.ts';

// DR2-9: a box opened low on the phone (Triaje's send-back reason) went under the bottom bar or the
// keyboard; this is how far the page must scroll so its foot shows above both.
describe('hiddenBelow', () => {
  it.each([
    ['is nothing when the box ends above the bar', 700, 844, 770, 0],
    ['is the part under the bottom bar, with a margin', 800, 844, 770, 42],
    ['reads the keyboard, which covers the bar, as the floor', 700, 500, 770, 212],
    ['without a bar, the floor is the screen', 840, 844, null, 8],
  ])('%s', (_, bottom, visible, bar, hidden) => {
    expect(hiddenBelow({ bottom }, { innerHeight: 844, visible, bar })).toBe(hidden);
  });
});
