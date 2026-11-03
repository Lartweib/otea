export type Clock = {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export type Throttled = { (): void; cancel(): void };

// Leading and trailing: the first call runs at once, calls inside the window collapse into one run
// at its end, so the first change is instant and the last one always lands.
export function throttle(run: () => void, ms: number, clock: Clock = systemClock): Throttled {
  let last = Number.NEGATIVE_INFINITY;
  let pending: unknown;
  const fire = () => {
    pending = undefined;
    last = clock.now();
    run();
  };
  const throttled = () => {
    if (pending !== undefined) return;
    const wait = last + ms - clock.now();
    if (wait <= 0) fire();
    else pending = clock.setTimeout(fire, wait);
  };
  throttled.cancel = () => {
    if (pending !== undefined) clock.clearTimeout(pending);
    pending = undefined;
  };
  return throttled;
}

// At most once per window, dropping the rest: one flash or bounce for a batch of handoffs.
export function cooldown(ms: number, clock: Clock = systemClock): () => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const now = clock.now();
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}
