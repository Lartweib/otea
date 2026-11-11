import { clamp } from './curves.ts';

// Durations grow with distance, on a square root: a long trip takes longer, never twice as long.
// travel is the owner's validated handoff travel (mock:1035), slower than MOTION's table.
export const Tt = {
  travel: (d: number): number => clamp(480 + 28 * Math.sqrt(Math.abs(d)), 560, 1040),
  line: (l: number): number => clamp(300 + 14 * Math.sqrt(Math.min(400, Math.abs(l))), 360, 760),
  morph: (d: number): number => clamp(420 + 16 * Math.sqrt(Math.abs(d)), 480, 760),
};

// The fixed steps (mirrored by the --t-* tokens), and the reduced-motion crossfade.
export const T = {
  hover: 120,
  fade: 240,
  small: 360,
  surface: 440,
  pane: 600,
  reduced: 160,
} as const;

// Items of a pop, a dialog or a drawer resolve one after another: base + 34 * min(i, 5).
export const STAGGER = { menu: 34, cap: 5 } as const;

export const staggerAt = (base: number, i: number): number =>
  base + STAGGER.menu * Math.min(i, STAGGER.cap);
