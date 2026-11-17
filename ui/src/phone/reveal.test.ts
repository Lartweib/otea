import { describe, expect, it } from 'vitest';
import { hiddenBelow } from './reveal.ts';

// DR2-9: a box opened low on the phone (Triaje's send-back reason) went under the bottom bar or the
// keyboard; this is how far the page must scroll so its foot shows above both.
describe('hiddenBelow', () => {
  it('is nothing when the box ends above the bar', () => {
    expect(hiddenBelow({ bottom: 700 }, { innerHeight: 844, visible: 844, bar: 770 })).toBe(0);
  });

  it('is the part under the bottom bar, with a margin', () => {
    expect(hiddenBelow({ bottom: 800 }, { innerHeight: 844, visible: 844, bar: 770 })).toBe(42);
  });

  it('reads the keyboard, which covers the bar, as the floor', () => {
    expect(hiddenBelow({ bottom: 700 }, { innerHeight: 844, visible: 500, bar: 770 })).toBe(212);
  });

  it('without a bar, the floor is the screen', () => {
    expect(hiddenBelow({ bottom: 840 }, { innerHeight: 844, visible: 844, bar: null })).toBe(8);
  });
});
