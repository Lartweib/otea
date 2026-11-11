import { useEffect } from 'react';
import { C } from '../motion/curves.ts';

// The one tooltip (mock:4055-4069): any [data-tip] says its words after 350 ms of hover, or at once
// on keyboard focus; to the right inside the rail, below elsewhere. Words already written next to a
// control (an unfolded rail's rows) need no tip. Mounted once by App.

const ROW = '.nav > .nrow, .nav > button, .nav > a';

function shows(el: HTMLElement): boolean {
  if (!el.isConnected || !el.dataset.tip) return false;
  const folded = !!el.closest('.app[data-folded]');
  return folded || !el.matches(ROW);
}

export function Tooltip() {
  useEffect(() => {
    let tip: HTMLDivElement | null = null;
    let timer = 0;
    let on: HTMLElement | null = null;
    const show = (el: HTMLElement, wait: number) => {
      clearTimeout(timer);
      on = el;
      timer = window.setTimeout(() => {
        if (!shows(el)) return;
        if (!tip) {
          tip = document.createElement('div');
          tip.className = 'tip';
          tip.setAttribute('role', 'tooltip');
          document.body.appendChild(tip);
        }
        tip.textContent = el.dataset.tip ?? '';
        const r = el.getBoundingClientRect();
        const right = !!el.closest('.rail');
        tip.style.left = `${right ? r.right + 8 : r.left}px`;
        tip.style.top = `${right ? r.top + r.height / 2 - 11 : r.bottom + 6}px`;
        tip.animate(
          [
            { opacity: 0, transform: 'translateX(-3px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 240, easing: C.glide, fill: 'both' },
        );
      }, wait);
    };
    const hide = () => {
      clearTimeout(timer);
      on = null;
      const t = tip;
      tip = null;
      t?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 160,
        easing: C.drift,
        fill: 'forwards',
      }).finished.then(
        () => t.remove(),
        () => t.remove(),
      );
    };
    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]');
      if (el === on) return;
      if (el) show(el, 350);
      else hide();
    };
    const focus = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]');
      if (el && (e.target as HTMLElement).matches(':focus-visible')) show(el, 0);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      clearTimeout(timer);
      tip?.remove();
    };
  }, []);
  return null;
}
