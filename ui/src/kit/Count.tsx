import { useLayoutEffect, useRef, useState } from 'react';
import { motionBus } from '../motion/bus.ts';
import { rollTo } from '../motion/roll.ts';

type CountProps = {
  value: number | string;
  tone?: 'you' | 'warn';
  // Wait for the handoff in flight to be half-way before rolling (the rail, section heads).
  hold?: boolean;
  className?: string;
  'data-leaf'?: string;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

// A count that rolls when it changes: only the digits that change, up when it grows
// (MOTION §3.13). The value React rendered first stays in the markup; every change after that is
// written by the roll, so React never fights it.
export function Count({ value, tone, hold = false, className, ...rest }: CountProps) {
  const [first] = useState(() => String(value));
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = String(value);
    let off: (() => void) | undefined;
    let offIdle: (() => void) | undefined;
    const roll = () => {
      off?.();
      offIdle?.();
      rollTo(el, to);
    };
    if (!hold) {
      roll();
      return;
    }
    // Every layout effect of this commit runs before the microtask: a handoff the commit started
    // is in flight by then.
    let dead = false;
    queueMicrotask(() => {
      if (dead) return;
      if (!motionBus.inFlight()) return roll();
      off = motionBus.onHalf(roll);
      offIdle = motionBus.onIdle(roll);
    });
    return () => {
      dead = true;
      off?.();
      offIdle?.();
    };
  }, [value, hold]);
  const classes = ['n', tone, className].filter(Boolean).join(' ');
  return (
    <span ref={ref} className={classes} {...rest}>
      <span
        className="nv"
        data-v={first}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped text, set once so the roll owns it after
        dangerouslySetInnerHTML={{ __html: escapeHtml(first) }}
      />
    </span>
  );
}
