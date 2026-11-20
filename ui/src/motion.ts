import { reduced } from './motion/reduced.ts';

// Lift, carry, set down. The list is measured before and after every change (FLIP): a row that changed
// hands is carried from its old place and lane, closing sinks it into the trunk, and the rest make room.

// One motion system: three durations and one easing, mirrored by the --m-* tokens in
// styles/tokens.css. fast: hover, press, the selection band; base: the chevron, content coming in,
// a fade, the divider going home; slow: anything else that moves layout (FLIP).
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 280,
  ease: 'cubic-bezier(0.25, 1, 0.5, 1)',
} as const;

// The turn change keeps its own family (lift, carry, set down): the carried row travels 680ms and
// the rows making room for it follow its clock.
export const TIMING = {
  travel: { duration: 680, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  room: { duration: 600, delay: 90, easing: MOTION.ease },
  ripple: { duration: 760, delay: 560, easing: MOTION.ease },
} as const;

// The theme switch opens the new theme as a circle from a point (the toggle's centre) on the turn
// change's clock (TIMING.travel); its radius reaches the farthest corner of the viewport.
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}

// Reduced motion as the Motion preference reads it (the system's, unless this browser chose).
export const reducedMotion = (): boolean => reduced();
