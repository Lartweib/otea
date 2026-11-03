import { describe, expect, it } from 'vitest';
import { type Clock, cooldown, throttle } from './throttle.ts';

function fakeClock() {
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let next = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (run, ms) => {
      const id = ++next;
      timers.push({ at: now + ms, run, id });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((timer) => timer.id !== id);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    for (const timer of due) timer.run();
  };
  return { clock, advance };
}

describe('throttle', () => {
  it('runs the first call at once and collapses the rest of the window into one trailing run', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    const apply = throttle(() => runs++, 500, clock);
    apply();
    expect(runs).toBe(1);
    apply();
    apply();
    advance(200);
    apply();
    expect(runs).toBe(1);
    advance(300);
    expect(runs).toBe(2);
    advance(1000);
    expect(runs).toBe(2);
  });

  it('runs at once again after a quiet window', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    const apply = throttle(() => runs++, 500, clock);
    apply();
    advance(600);
    apply();
    expect(runs).toBe(2);
  });

  it('drops a pending run when cancelled', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    const apply = throttle(() => runs++, 500, clock);
    apply();
    apply();
    apply.cancel();
    advance(1000);
    expect(runs).toBe(1);
  });
});

describe('cooldown', () => {
  it('allows once per window and refuses the rest', () => {
    const { clock, advance } = fakeClock();
    const may = cooldown(30_000, clock);
    expect(may()).toBe(true);
    advance(10_000);
    expect(may()).toBe(false);
    advance(20_000);
    expect(may()).toBe(true);
  });
});
