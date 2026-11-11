import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';

// The light along a toast's top line (mock .pop .pline .glint, showToast): a 70 px blue glint
// enters beyond the left end and leaves past the right one, 720 drift. It runs when the toast
// opens (once the line has mostly drawn) and when a second message replaces the first (at once).
// Reduced motion keeps it dark.

export const GLINT = { open: 180, replace: 0, duration: 720 } as const;

export function glintFrames(width: number): Keyframe[] {
  return [
    { transform: 'translateX(-70px)', opacity: 0 },
    { opacity: 1, offset: 0.25 },
    { opacity: 1, offset: 0.7 },
    { transform: `translateX(${width}px)`, opacity: 0 },
  ];
}

export function glint(surface: HTMLElement, delay: number): void {
  if (reduced()) return;
  surface.querySelector<HTMLElement>('.glint')?.animate(glintFrames(surface.offsetWidth), {
    duration: GLINT.duration,
    delay,
    easing: C.drift,
    fill: 'backwards',
  });
}
