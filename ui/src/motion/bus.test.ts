import { describe, expect, it } from 'vitest';
import { motionBus } from './bus.ts';

describe('the handoff clock', () => {
  it('says a handoff is in flight between its begin and its end', () => {
    expect(motionBus.inFlight()).toBe(false);
    motionBus.begin('a');
    expect(motionBus.inFlight()).toBe(true);
    motionBus.end('a');
    expect(motionBus.inFlight()).toBe(false);
  });

  it('calls who waits at the half, once nothing is in flight, and stops when told', () => {
    const calls: string[] = [];
    const offHalf = motionBus.onHalf(() => calls.push('half'));
    const offIdle = motionBus.onIdle(() => calls.push('idle'));
    motionBus.begin('a');
    motionBus.begin('b');
    motionBus.half('a');
    motionBus.end('a');
    motionBus.end('b');
    motionBus.end('b');
    offHalf();
    offIdle();
    motionBus.begin('c');
    motionBus.half('c');
    motionBus.end('c');
    expect(calls).toEqual(['half', 'idle']);
  });
});
