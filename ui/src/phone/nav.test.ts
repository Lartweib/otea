import { describe, expect, it, vi } from 'vitest';
import { makeNavSheet } from './nav.ts';

describe('the nav sheet store', () => {
  it('starts closed and opens, closes and toggles', () => {
    const s = makeNavSheet();
    expect(s.get()).toBe(false);
    s.open();
    expect(s.get()).toBe(true);
    s.toggle();
    expect(s.get()).toBe(false);
    s.toggle();
    s.close();
    expect(s.get()).toBe(false);
  });

  it('tells its listeners only when it changes', () => {
    const s = makeNavSheet();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.close();
    expect(fn).not.toHaveBeenCalled();
    s.open();
    s.open();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    s.close();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
