import { afterEach, describe, expect, it, vi } from 'vitest';
import { landed, motionBus } from './bus.ts';

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

afterEach(() => vi.useRealTimers());

describe('waiting for a move to land', () => {
  it('resolves when the handoff carrying it is half-way, where its counts roll', async () => {
    vi.useFakeTimers();
    let done = false;
    void landed().then(() => {
      done = true;
    });
    motionBus.begin('h1');
    await vi.advanceTimersByTimeAsync(50);
    expect(done).toBe(false);
    motionBus.half('h1');
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    motionBus.end('h1');
  });

  it('gives up when no handoff carries it', async () => {
    vi.useFakeTimers();
    let done = false;
    void landed(300).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });
});
