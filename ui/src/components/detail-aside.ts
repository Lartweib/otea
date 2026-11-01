import { type RefObject, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { asideHeight, type DetailForm, detailForm, travelPath } from '../detail-form.ts';
import { MOTION, reducedMotion } from '../motion.ts';

// The detail's two forms (see detail-form.ts) and how it switches between them.
//
// The detail pane is measured with a ResizeObserver. While the divider is dragged the layout
// follows the pointer and the form waits for the release; a sidebar fold (or a step of the divider
// from the keyboard) switches at once; a window resize switches once it has been quiet for 150ms.
// Details (into the band, or back under Structure) and History (beside the main column, or back to
// the end) then travel from where they were (FLIP), on the slow token.

const TRAVEL = 'travel';
const RESIZE_QUIET = 150;
// Air between the main column and a section travelling beside it.
const AIR = 24;

const travellersOf = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-travel]'),
];

function snapshot(root: HTMLElement): Map<string, DOMRect> {
  return new Map(
    travellersOf(root).map((element) => [
      element.dataset.travel ?? '',
      element.getBoundingClientRect(),
    ]),
  );
}

// Details and History travel from their old boxes to their new ones. Every box is measured before
// anything starts; each takes its own path (detail-form.ts), clear of the main column, and their
// content dips to half opacity while it re-flows. Reduced motion: a 120ms crossfade.
function travel(root: HTMLElement, before: Map<string, DOMRect>, toAside: boolean) {
  const elements = travellersOf(root);
  for (const element of elements) {
    for (const animation of element.getAnimations())
      if (animation.id === TRAVEL) animation.cancel();
  }
  const moves = elements.flatMap((element) => {
    const was = before.get(element.dataset.travel ?? '');
    const now = element.getBoundingClientRect();
    if (!was || now.width === 0) return [];
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    return Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 ? [] : [{ element, now, dx, dy }];
  });
  if (moves.length === 0) return;
  if (reducedMotion()) {
    for (const { element } of moves) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], { id: TRAVEL, duration: MOTION.fast });
    }
    return;
  }
  const mainRight = Math.max(
    ...[...root.querySelectorAll('.detail-head, .detail-main > *')].map(
      (element) => element.getBoundingClientRect().right,
    ),
  );
  const options = { id: TRAVEL, duration: MOTION.slow };
  const x = (value: number, offset: number, easing: string) => ({
    transform: `translateX(${value}px)`,
    offset,
    easing,
  });
  const y = (value: number, offset: number, easing: string) => ({
    transform: `translateY(${value}px)`,
    offset,
    easing,
  });
  for (const { element, now, dx, dy } of moves) {
    const { xw, t1, t2 } = travelPath(dx, dy, mainRight + AIR - now.left, toAside);
    element.animate(
      [x(dx, 0, MOTION.ease), x(xw, t1, 'linear'), x(xw, t2, MOTION.ease), x(0, 1, 'linear')],
      options,
    );
    element.animate(
      [y(dy, 0, 'linear'), y(dy, t1, MOTION.ease), y(0, t2, 'linear'), y(0, 1, 'linear')],
      { ...options, composite: 'add' },
    );
    element.animate([{ opacity: 1 }, { opacity: 0.5, offset: 0.3 }, { opacity: 1 }], options);
  }
}

// History, beside the main column, is never taller than the room it has under its top in the pane.
function fitAside(root: HTMLElement, pane: HTMLElement) {
  const aside = root.querySelector<HTMLElement>('[data-travel="history"]');
  if (!aside) return;
  if (root.dataset.form !== 'aside') {
    aside.style.maxHeight = '';
    return;
  }
  const top = aside.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  // The room ends where the pane's content does: above the panel's bottom padding.
  const panel = root.parentElement ?? pane;
  const bottom =
    (Number.parseFloat(getComputedStyle(pane).paddingBottom) || 0) +
    (panel === pane ? 0 : Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0);
  aside.style.maxHeight = `${asideHeight(pane.clientHeight, top, bottom)}px`;
}

// The detail's form, following the pane it sits in. Off (a phone's unfolded detail): stacked.
export function useDetailForm(root: RefObject<HTMLElement | null>, enabled: boolean): DetailForm {
  const [form, setForm] = useState<DetailForm>('stacked');

  useLayoutEffect(() => {
    const element = root.current;
    const pane = element?.closest<HTMLElement>('[data-pane="detail"]');
    if (!enabled || !element || !pane) {
      setForm('stacked');
      return;
    }
    let current: DetailForm = detailForm(pane.clientWidth);
    // The first form is taken before anything is painted, without motion.
    setForm(current);
    let quiet = 0;
    let resizedAt = Number.NEGATIVE_INFINITY;
    let waiting = false;

    const settle = () => {
      const next = detailForm(pane.clientWidth);
      if (next === current) {
        fitAside(element, pane);
        return;
      }
      const before = snapshot(element);
      current = next;
      flushSync(() => setForm(next));
      fitAside(element, pane);
      travel(element, before, next === 'aside');
    };
    const afterDrag = () => {
      waiting = false;
      settle();
    };
    const onResize = () => {
      resizedAt = performance.now();
    };
    const observer = new ResizeObserver(() => {
      const workspace = pane.closest<HTMLElement>('.workspace');
      if (workspace?.dataset.dragging) {
        // The layout follows the pointer; the form waits for the release.
        if (!waiting) {
          waiting = true;
          window.addEventListener('pointerup', afterDrag, { once: true });
          window.addEventListener('pointercancel', afterDrag, { once: true });
        }
        return;
      }
      if (performance.now() - resizedAt < 250) {
        window.clearTimeout(quiet);
        quiet = window.setTimeout(settle, RESIZE_QUIET);
        return;
      }
      settle();
    });
    observer.observe(pane);
    // The detail's own size (its header wrapping, content loading) moves the aside's top.
    observer.observe(element);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.clearTimeout(quiet);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerup', afterDrag);
      window.removeEventListener('pointercancel', afterDrag);
    };
  }, [root, enabled]);

  // Once the form is in the page, History gets the room it has.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new form is fitted
  useLayoutEffect(() => {
    const element = root.current;
    const pane = element?.closest<HTMLElement>('[data-pane="detail"]');
    if (element && pane) fitAside(element, pane);
  }, [root, form]);

  return enabled ? form : 'stacked';
}
