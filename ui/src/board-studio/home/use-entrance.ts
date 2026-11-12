import { type RefObject, useLayoutEffect } from 'react';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';

// Studio's entrance (the mock's enter(), DESIGN.md §7): the lines lead (rules draw out from the
// left), then the surfaces (the plates unroll from their top), then the content resolves, each
// group a little after the one before. What arrives later (the boards once read) enters the same
// way, as its own batch. Reduced motion: a 160 ms fade, nothing moves.

const DONE = 'entered';

export function enter(scope: HTMLElement, base = 0): void {
  const fresh = (kind: string) =>
    [...scope.querySelectorAll<HTMLElement>(`[data-e="${kind}"]`)].filter((e) => !e.dataset[DONE]);
  const lines = fresh('line');
  const surfs = fresh('surf');
  const items = fresh('in');
  for (const e of [...lines, ...surfs, ...items]) e.dataset[DONE] = '1';
  if (reduced()) {
    for (const e of [...lines, ...surfs, ...items])
      e.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 160,
        easing: C.drift,
        fill: 'backwards',
      });
    return;
  }
  lines.forEach((e, i) => {
    e.animate([{ transform: 'scaleX(0.001)' }, { transform: 'scaleX(1)' }], {
      duration: 360,
      delay: base + i * 30,
      easing: C.glide,
      fill: 'backwards',
    });
  });
  surfs.forEach((e, i) => {
    e.animate(
      [
        { clipPath: 'inset(0 0 100% 0 round 12px)', transform: 'translateY(-6px)' },
        { clipPath: 'inset(0 0 0% 0 round 12px)', transform: 'none' },
      ],
      { duration: 480, delay: base + 90 + i * 60, easing: C.settle, fill: 'backwards' },
    );
  });
  items.forEach((e, i) => {
    e.animate(
      [
        { opacity: 0, filter: 'blur(1px)', transform: 'translateY(4px)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ],
      {
        duration: 380,
        delay: base + 170 + 30 * Math.min(i, 14),
        easing: C.glide,
        fill: 'backwards',
      },
    );
  });
}

// Runs after every commit: anything new under the root enters.
export function useEntrance(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (root.current) enter(root.current);
  });
}
