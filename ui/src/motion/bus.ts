// The handoff's clock, for whoever waits on it: a count that changed because of a handoff rolls
// when the row is visibly half-way (the rail, section heads, the colophon). runHandoff calls
// begin, half and end; <Count hold> listens.

const inFlightIds = new Set<string>();
const halfListeners = new Set<() => void>();
const idleListeners = new Set<() => void>();

function emit(set: Set<() => void>): void {
  for (const fn of [...set]) fn();
}

export const motionBus = {
  begin(id: string): void {
    inFlightIds.add(id);
  },
  half(id: string): void {
    if (inFlightIds.has(id)) emit(halfListeners);
  },
  end(id: string): void {
    if (!inFlightIds.delete(id)) return;
    if (inFlightIds.size === 0) emit(idleListeners);
  },
  inFlight(): boolean {
    return inFlightIds.size > 0;
  },
  onHalf(fn: () => void): () => void {
    halfListeners.add(fn);
    return () => halfListeners.delete(fn);
  },
  // Called once nothing is in flight any more: a waiting count that missed its half rolls then.
  onIdle(fn: () => void): () => void {
    idleListeners.add(fn);
    return () => idleListeners.delete(fn);
  },
};

// The longest a count waits on a handoff: past it the handoff's half has long gone by.
export const HOLD_MAX = 1600;

// Calls fn once: at the half of the handoff in flight, once nothing is in flight any more, or after
// HOLD_MAX at the latest, so a handoff cut short or one that never ends cannot leave a count
// behind its rows (DR3-3). With nothing in flight it calls fn at once. Returns how to stop waiting.
export function afterHalf(fn: () => void): () => void {
  if (!motionBus.inFlight()) {
    fn();
    return () => {};
  }
  let done = false;
  const go = () => {
    if (done) return;
    stop();
    fn();
  };
  const offHalf = motionBus.onHalf(go);
  const offIdle = motionBus.onIdle(go);
  const timer = setTimeout(go, HOLD_MAX);
  function stop() {
    done = true;
    offHalf();
    offIdle();
    clearTimeout(timer);
  }
  return stop;
}

// A move has landed: the handoff carrying it is half-way (its pulse blooms, its counts roll). With
// no handoff in flight or starting within `wait` ms (the row is not on screen), it resolves then.
export function landed(wait = 700): Promise<void> {
  return new Promise((resolve) => {
    const offHalf = motionBus.onHalf(() => finish());
    const timer = setTimeout(() => {
      if (!motionBus.inFlight()) finish();
    }, wait);
    // A handoff that never reaches half (cut short) still ends.
    const offIdle = motionBus.onIdle(() => finish());
    function finish() {
      offHalf();
      offIdle();
      clearTimeout(timer);
      resolve();
    }
  });
}
