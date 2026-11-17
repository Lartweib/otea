import { describe, expect, it } from 'vitest';
import { keepInView } from './keep-in-view.ts';

function viewport() {
  const listeners = new Set<() => void>();
  return {
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    resize: () => {
      for (const fn of [...listeners]) fn();
    },
    listeners,
  } as unknown as VisualViewport & { resize: () => void; listeners: Set<() => void> };
}

describe('the send row under a box typed in on the phone (DR3-15)', () => {
  it('comes into view as the keyboard rises, and once more a moment later', () => {
    const calls: ScrollIntoViewOptions[] = [];
    const row = { scrollIntoView: (o?: boolean | ScrollIntoViewOptions) => calls.push(o as never) };
    const vv = viewport();
    let later: (() => void) | undefined;
    keepInView(row, vv, (fn) => {
      later = fn;
      return () => {};
    });

    vv.resize();
    later?.();

    expect(calls).toEqual([{ block: 'nearest' }, { block: 'nearest' }]);
  });

  it('stops following once the box is left', () => {
    const calls: unknown[] = [];
    const vv = viewport();
    let cancelled = false;
    const stop = keepInView({ scrollIntoView: () => calls.push(1) }, vv, () => () => {
      cancelled = true;
    });

    stop();
    vv.resize();

    expect(calls).toEqual([]);
    expect(cancelled).toBe(true);
    expect(vv.listeners.size).toBe(0);
  });
});
