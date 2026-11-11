import { describe, expect, it } from 'vitest';
import { revive } from './view-revive.ts';

describe('a view that comes back while it was leaving', () => {
  it('cancels its leave (the fade and the lanes retracting) and forgets it started', () => {
    const cancelled: string[] = [];
    const anim = (name: string) => ({ cancel: () => cancelled.push(name) });
    const view = {
      dataset: { leavingStarted: '1' } as DOMStringMap,
      getAnimations: (o?: GetAnimationsOptions) =>
        o?.subtree ? [anim('fade'), anim('retract')] : [anim('fade')],
    };
    expect(revive(view)).toBe(true);
    expect(cancelled).toEqual(['fade', 'retract']);
    expect(view.dataset.leavingStarted).toBeUndefined();
  });

  it('leaves a view that was not leaving alone', () => {
    const view = { dataset: {} as DOMStringMap, getAnimations: () => [] };
    expect(revive(view)).toBe(false);
  });
});
