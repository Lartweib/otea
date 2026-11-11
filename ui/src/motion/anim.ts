import { type Curve, easing } from './curves.ts';

// A WAAPI shorthand on the motion system's curves. A part that starts after a delay holds its first
// keyframe meanwhile (fill both by default): the first frame is always the starting pose.
export function anim(
  el: Element,
  kf: Keyframe[],
  T: number,
  curve: Curve | string = 'settle',
  delay = 0,
  fill: FillMode = 'both',
): Animation {
  return el.animate(kf, { duration: T, delay, easing: easing(curve), fill });
}
