import { C } from './curves.ts';
import { reduced } from './reduced.ts';

export type SwapOptions = { dy?: number; outT?: number; inT?: number; inDelay?: number };

// Words that change: two copies, the old leaves upward, the new arrives from below
// (mock:1126-1140, MOTION §3.12). Takes the new content as markup.
export function swapText(el: HTMLElement, html: string, opts: SwapOptions = {}): void {
  const { dy = 4, outT = 220, inT = 380, inDelay = 60 } = opts;
  if (el.innerHTML === html) return;
  if (reduced() || !el.isConnected || el.offsetParent === null) {
    el.innerHTML = html;
    if (el.isConnected && reduced()) {
      el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 160, easing: C.drift });
    }
    return;
  }
  const old = swapOut(el);
  el.innerHTML = html;
  swapIn(el, old, { dy, outT, inT, inDelay });
}

// The leaving copy of el's current content, laid over it.
export function swapOut(el: HTMLElement): HTMLElement {
  const old = document.createElement(el.tagName === 'P' ? 'span' : 'div');
  old.innerHTML = el.innerHTML;
  old.setAttribute('aria-hidden', 'true');
  Object.assign(old.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    right: '0',
    pointerEvents: 'none',
    display: 'block',
  });
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  return old;
}

// Runs the swap once el holds its new content: wraps it, adds the old copy, animates both, and
// unwraps when it lands.
export function swapIn(
  el: HTMLElement,
  old: HTMLElement,
  { dy = 4, outT = 220, inT = 380, inDelay = 60 }: SwapOptions = {},
): void {
  const inner = document.createElement('span');
  inner.style.display = 'block';
  while (el.firstChild) inner.appendChild(el.firstChild);
  el.append(inner, old);
  old.animate(
    [
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
      { opacity: 0, transform: `translateY(${-dy}px)`, filter: 'blur(1px)' },
    ],
    { duration: outT, easing: C.glide, fill: 'both' },
  );
  inner.animate(
    [
      { opacity: 0, transform: `translateY(${dy}px)`, filter: 'blur(1px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0px)' },
    ],
    { duration: inT, delay: inDelay, easing: C.glide, fill: 'backwards' },
  );
  setTimeout(
    () => {
      if (!old.isConnected) return;
      old.remove();
      if (inner.parentNode === el) {
        while (inner.firstChild) el.insertBefore(inner.firstChild, inner);
        inner.remove();
      }
    },
    inDelay + inT + 30,
  );
}
