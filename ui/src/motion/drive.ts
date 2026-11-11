import { clamp } from './curves.ts';

// One rAF driver: every frame is a pure function of progress k (0..1) and of the time t since the
// delay ran out. With no delay the first frame is written synchronously, in the same task as the
// DOM change that started the gesture, so nothing is ever painted at its destination first.
export type Drive = { cancel(): void };

export function drive(T: number, fn: (k: number, t: number) => void, delay = 0): Drive {
  const t0 = performance.now();
  let h = 0;
  let dead = false;
  const step = (n: number) => {
    if (dead) return;
    const t = n - t0 - delay;
    if (t < 0) {
      h = requestAnimationFrame(step);
      return;
    }
    fn(clamp(t / T), t);
    if (t < T) h = requestAnimationFrame(step);
  };
  if (!delay) fn(0, 0);
  h = requestAnimationFrame(step);
  return {
    cancel() {
      dead = true;
      cancelAnimationFrame(h);
    },
  };
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
