import { useSyncExternalStore } from 'react';

// The Motion preference of this browser (mock:1009-1010, 4096-4102): follow the system, always
// move, or always reduce. Reduced turns every recipe into a short crossfade in place.
export type MotionPref = 'system' | 'full' | 'reduced';

const KEY = 'otea.motion';
const QUERY = '(prefers-reduced-motion: reduce)';
const listeners = new Set<() => void>();

export function motionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'full' || v === 'reduced' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemReduces(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;
}

// The root carries data-motion only for an explicit choice, so CSS can stop perpetual motion
// (the orbit, the light's breath) for it and follow prefers-reduced-motion otherwise.
export function applyMotionPref(p: MotionPref = motionPref()): void {
  if (typeof document === 'undefined') return;
  const data = document.documentElement.dataset;
  if (p === 'system') delete data.motion;
  else data.motion = p;
}

export function setMotionPref(p: MotionPref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // a browser that keeps nothing still switches for this page
  }
  applyMotionPref(p);
  for (const fn of listeners) fn();
}

export function reduced(): boolean {
  const p = motionPref();
  return p === 'reduced' || (p === 'system' && systemReduces());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const list = typeof window !== 'undefined' ? window.matchMedia?.(QUERY) : undefined;
  list?.addEventListener('change', fn);
  return () => {
    listeners.delete(fn);
    list?.removeEventListener('change', fn);
  };
}

export function onMotionPref(fn: () => void): () => void {
  return subscribe(fn);
}

// Follows both the preference and the system.
export function useReduced(): boolean {
  return useSyncExternalStore(subscribe, reduced, () => false);
}
