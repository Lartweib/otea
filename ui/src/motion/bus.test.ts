import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterHalf, HOLD_MAX, landed, motionBus } from './bus.ts';

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

describe('a count that waits for the handoff', () => {
  it('rolls at the half of the handoff in flight', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    motionBus.begin('w1');
    const off = afterHalf(() => calls.push('roll'));
    motionBus.half('w1');
    motionBus.end('w1');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual(['roll']);
    off();
  });

  it('rolls at once with nothing in flight', () => {
    const calls: string[] = [];
    afterHalf(() => calls.push('roll'));
    expect(calls).toEqual(['roll']);
  });

  // A handoff cut short before its half, or one that never ends, once left the section counts of
  // Te toca behind their rows until a reload (DR3-3).
  it('never waits longer than a handoff lasts', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    motionBus.begin('never-ends');
    afterHalf(() => calls.push('roll'));
    await vi.advanceTimersByTimeAsync(HOLD_MAX - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(calls).toEqual(['roll']);
    motionBus.half('never-ends');
    motionBus.end('never-ends');
    expect(calls).toEqual(['roll']);
  });

  it('does nothing once told to stop', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    motionBus.begin('w2');
    const off = afterHalf(() => calls.push('roll'));
    off();
    motionBus.half('w2');
    motionBus.end('w2');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([]);
  });
});
