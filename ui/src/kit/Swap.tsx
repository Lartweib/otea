import { createElement, type ReactNode, useLayoutEffect, useRef } from 'react';
import { C } from '../motion/curves.ts';
import { reduced } from '../motion/reduced.ts';

type SwapProps = {
  // When k changes, the old words leave upward and the new arrive from below.
  k: string | number;
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'small';
  className?: string;
  dy?: number;
  outT?: number;
  inT?: number;
  inDelay?: number;
  children: ReactNode;
};

// Words that change in place (mock:1126-1140, MOTION §3.12), for React: the new content renders in
// an inner span React owns; the old one is a copy laid over it, leaving.
export function Swap({
  k,
  as = 'span',
  className,
  dy = 4,
  outT = 220,
  inT = 380,
  inDelay = 60,
  children,
}: SwapProps) {
  const host = useRef<HTMLElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const was = useRef<{ k: string | number; html: string } | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    const into = inner.current;
    if (!el || !into) return;
    const before = was.current;
    was.current = { k, html: into.innerHTML };
    if (!before || before.k === k || before.html === into.innerHTML) return;
    if (reduced() || el.offsetParent === null) {
      if (reduced())
        into.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 160, easing: C.drift });
      return;
    }
    const old = document.createElement('span');
    old.innerHTML = before.html;
    old.setAttribute('aria-hidden', 'true');
    Object.assign(old.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      right: '0',
      pointerEvents: 'none',
      display: 'block',
    });
    el.appendChild(old);
    old
      .animate(
        [
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
          { opacity: 0, transform: `translateY(${-dy}px)`, filter: 'blur(1px)' },
        ],
        { duration: outT, easing: C.glide, fill: 'both' },
      )
      .finished.then(
        () => old.remove(),
        () => old.remove(),
      );
    into.animate(
      [
        { opacity: 0, transform: `translateY(${dy}px)`, filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: inT, delay: inDelay, easing: C.glide, fill: 'backwards' },
    );
  }, [k, dy, outT, inT, inDelay]);
  return createElement(
    as,
    { ref: host, className, style: { position: 'relative' } },
    createElement('span', { ref: inner, className: 'swin', style: { display: 'block' } }, children),
  );
}
