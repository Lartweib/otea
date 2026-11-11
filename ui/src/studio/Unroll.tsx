import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { popParts } from '../kit/pop/Pop.tsx';
import { Choreo } from '../motion/choreo.ts';
import { clamp } from '../motion/curves.ts';

// A panel that opens where it stands, in the pop's grammar (mock:3271-3277, MOTION §3.1): the line
// leads from its trigger, the surface unrolls riding its edge, the items marked data-i resolve. It
// stays drawn while it closes, the same gesture mirrored, and a press that brings it back reverses
// it from where it is. Unlike a Pop it is not portalled: its owner places it (a field's menu in the
// canvas's free column, the picker under its +, the tray under its button).

type UnrollProps = {
  open: boolean;
  label: string;
  edge?: 'top' | 'bottom';
  // The trigger whose centre the line leads from; the line grows from the middle without one.
  from?: HTMLElement | null | undefined;
  role?: 'dialog' | 'menu';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Unroll({
  open,
  label,
  edge = 'top',
  from,
  role = 'dialog',
  className,
  style,
  children,
}: UnrollProps) {
  const [mounted, setMounted] = useState(open);
  const el = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);
  // While it closes it keeps showing what it showed: its owner has already let go of it.
  const last = useRef<ReactNode>(children);
  if (open) last.current = children;
  if (open && !mounted) setMounted(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (open) {
      if (!choreo.current) {
        const line = node.querySelector<HTMLElement>(':scope > .pline');
        if (line) {
          const r = node.getBoundingClientRect();
          const t = from?.getBoundingClientRect();
          line.style.transformOrigin = t
            ? `${clamp(t.left + t.width / 2 - r.left, 0, r.width)}px 0`
            : '50% 0';
        }
        choreo.current = new Choreo(popParts(node, edge));
      }
      choreo.current.go(1);
    } else if (choreo.current) {
      const ch = choreo.current;
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0) {
          choreo.current = null;
          setMounted(false);
        }
      });
    }
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: a dialog or a menu, both named
    <div
      ref={el}
      className={['pop', `e-${edge}`, 'st-unroll', className].filter(Boolean).join(' ')}
      role={role}
      aria-label={label}
      style={style}
    >
      <i className="pline">
        <i className="glint" />
      </i>
      <div className="psurf">
        <div className="pin">{open ? children : last.current}</div>
      </div>
    </div>
  );
}
