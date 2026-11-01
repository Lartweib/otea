import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { MOTION, reducedMotion } from '../motion.ts';
import type { CollectionView } from '../types.ts';
import { readViewPrefs, type ViewPrefs, writeViewPrefs } from '../view-prefs.ts';
import { browserStorage } from './Split.tsx';

// How this browser looks at the selected collection (see view-prefs.ts): read once per collection,
// then changed here and remembered.
export function useViewPrefs(
  collection: CollectionView | undefined,
): [ViewPrefs | undefined, (prefs: Partial<ViewPrefs>) => void] {
  const [chosen, setChosen] = useState<Readonly<Record<string, ViewPrefs>>>({});
  const prefs = collection
    ? (chosen[collection.name] ?? readViewPrefs(browserStorage(), collection))
    : undefined;
  const update = useCallback(
    (next: Partial<ViewPrefs>) => {
      if (!collection) return;
      writeViewPrefs(browserStorage(), collection.name, next);
      setChosen((current) => {
        const base = current[collection.name] ?? readViewPrefs(browserStorage(), collection);
        return { ...current, [collection.name]: { ...base, ...next } };
      });
    },
    [collection],
  );
  return [prefs, update];
}

// The detail beside the grid. When an item opens and the grid gave its room back, the grid narrows
// to its width (--grid-w eased from the whole room, on the slow token) while the detail comes in
// from 16px to the right; closing, the grid widens back. When the workspace changes between the
// list's room and the grid's, a detail that stays slides from where it was (FLIP). Reduced motion:
// the detail crossfades.
export function useDetailMotion(
  workspace: RefObject<HTMLElement | null>,
  gridded: boolean,
  detailOff: boolean,
  full: number,
  width: number,
) {
  const last = useRef<{ left: number; off: boolean; gridded: boolean } | undefined>(undefined);
  useLayoutEffect(() => {
    const root = workspace.current;
    const pane = root?.querySelector<HTMLElement>('[data-pane="detail"]');
    if (!root || !pane) return;
    const left = pane.getBoundingClientRect().left;
    const was = last.current;
    last.current = { left, off: detailOff, gridded };
    if (!was) return;
    const reduced = reducedMotion();
    if (was.off !== detailOff && gridded && was.gridded) {
      const [from, to] = detailOff ? [width, full] : [full, width];
      if (!reduced) {
        root.animate([{ '--grid-w': `${from}px` }, { '--grid-w': `${to}px` }], {
          duration: MOTION.slow,
          easing: MOTION.ease,
        });
      }
      if (!detailOff) {
        pane.animate(
          reduced
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'translateX(16px)' },
                { opacity: 1, transform: 'none' },
              ],
          { duration: reduced ? MOTION.fast : MOTION.slow, easing: MOTION.ease },
        );
      }
      return;
    }
    if (was.gridded !== gridded && !detailOff && !was.off) {
      const dx = was.left - left;
      if (Math.abs(dx) < 0.5) return;
      pane.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: `translateX(${dx}px)` }, { transform: 'none' }],
        { duration: reduced ? MOTION.fast : MOTION.slow, easing: MOTION.ease },
      );
      return;
    }
    if (was.off && !detailOff) {
      // The detail comes back as the workspace leaves the grid's room.
      pane.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: 'translateX(16px)' },
              { opacity: 1, transform: 'none' },
            ],
        { duration: reduced ? MOTION.fast : MOTION.slow, easing: MOTION.ease },
      );
    }
  });
}
