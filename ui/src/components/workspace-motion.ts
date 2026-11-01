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

// The id of the room's easing between the whole grid and the grid beside the detail: the detail's
// form waits for it to end (detail-aside.ts).
export const ROOM_EASE = 'room';

// The detail beside the grid. While nothing is open the grid has the whole room; when an item opens
// the grid narrows to its width (--grid-w eased from the whole room, on the slow token) while the
// detail comes in from 16px to the right, already laid out at the width it lands on, so its text
// never reflows on the way; closing, the grid widens back. The workspace says it is easing
// (data-easing), so the table keeps the room's measure until it lands. When the workspace changes
// between the list's room and the grid's, a detail that stays slides from where it was (FLIP).
// Reduced motion: no easing, the detail crossfades.
export function useDetailMotion(
  workspace: RefObject<HTMLElement | null>,
  gridded: boolean,
  detailOff: boolean,
  full: number,
  width: number,
) {
  const last = useRef<{ left: number; off: boolean; gridded: boolean } | undefined>(undefined);
  const easing = useRef<Animation | undefined>(undefined);
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
        easing.current?.cancel();
        const panel = pane.querySelector<HTMLElement>('.detail-panel');
        if (panel && !detailOff) panel.style.width = `${panel.offsetWidth}px`;
        root.dataset.easing = 'true';
        const animation = root.animate([{ '--grid-w': `${from}px` }, { '--grid-w': `${to}px` }], {
          id: ROOM_EASE,
          duration: MOTION.slow,
          easing: MOTION.ease,
        });
        easing.current = animation;
        const landed = () => {
          if (panel) panel.style.width = '';
          if (easing.current !== animation) return;
          easing.current = undefined;
          delete root.dataset.easing;
        };
        animation.finished.then(landed, landed);
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
