import { describe, expect, it } from 'vitest';
import { STAGGER, T, Tt } from './time.ts';

describe('durations by distance', () => {
  it('travels for 480 + 28√d, between 560 and 1040 ms, either way', () => {
    expect(Tt.travel(0)).toBe(560);
    expect(Tt.travel(100)).toBe(760);
    expect(Tt.travel(-100)).toBe(760);
    expect(Tt.travel(400)).toBe(1040);
    expect(Tt.travel(10_000)).toBe(1040);
  });

  it('draws a line for 300 + 14√l, at most 400 px counted, between 360 and 760 ms', () => {
    expect(Tt.line(0)).toBe(360);
    expect(Tt.line(100)).toBe(440);
    expect(Tt.line(400)).toBe(580);
    expect(Tt.line(4000)).toBe(580);
  });

  it('morphs for 420 + 16√d, between 480 and 760 ms', () => {
    expect(Tt.morph(0)).toBe(480);
    expect(Tt.morph(100)).toBe(580);
    expect(Tt.morph(10_000)).toBe(760);
  });

  it('keeps the fixed steps and the menu stagger', () => {
    expect(T).toEqual({ hover: 120, fade: 240, small: 360, surface: 440, pane: 600, reduced: 160 });
    expect(STAGGER).toEqual({ menu: 34, cap: 5 });
  });
});
