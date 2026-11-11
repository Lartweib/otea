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
