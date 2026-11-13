// The motion engine (SPEC §3): DOM-level, framework-free. React renders structure; these move it.
export { anim } from './anim.ts';
export { motionBus } from './bus.ts';
export { Choreo, closeT, leaveTogether, mirrorDelays, type Part, part } from './choreo.ts';
export {
  C,
  type Curve,
  clamp,
  easing,
  F,
  inkFn,
  lerp,
  linearOf,
  springFn,
  sstep,
} from './curves.ts';
export { type Drive, drive, wait } from './drive.ts';
export { type FlipOptions, flipLeaves, ghostOf } from './flip.ts';
export {
  applyMotionPref,
  type MotionPref,
  motionPref,
  onMotionPref,
  reduced,
  setMotionPref,
  useReduced,
} from './reduced.ts';
export { relayoutList } from './relayout.ts';
export { rollSplit, rollTo } from './roll.ts';
export { spring } from './spring.ts';
export { STAGGER, staggerAt, T, Tt } from './time.ts';
