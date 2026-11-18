import { afterEach, describe, expect, it, vi } from 'vitest';
import { laneParams } from './geometry.ts';
import { runHandoff, type Snap } from './handoff.ts';

afterEach(() => vi.unstubAllGlobals());

// A list with nothing in it: no rows, no lanes, only what runHandoff reads of it.
const emptyList = () =>
  ({
    children: [],
    dataset: {},
    offsetHeight: 400,
    offsetWidth: 600,
    querySelector: () => null,
    querySelectorAll: () => [],
  }) as unknown as HTMLElement;

describe('a move in a list with motion reduced', () => {
  // The reduced crossfade ends the move before the full one's setup runs: ending it must not reach
  // anything that setup declares (it threw «Cannot access 'F' before initialization» after an
  // approval).
  it('ends without reaching what only the full move sets up', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'reduced', setItem: () => undefined });
    const before: Snap = { m: new Map(), ov: laneParams([], 400, 600), st: {} };
    await expect(runHandoff(emptyList(), before, () => undefined)).resolves.toBeUndefined();
  });
});
