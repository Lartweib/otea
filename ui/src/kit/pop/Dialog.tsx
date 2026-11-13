import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Choreo, part } from '../../motion/choreo.ts';
import { useEscape } from '../escape.ts';
import { focusFirst, onDialogTab } from './focus.ts';
import { layerEl } from './Pop.tsx';

// A dialog (mock:3471-3495, MOTION §3.4): the scrim, then the line, then the surface riding up 6 px,
// then its items; the close is the same gesture mirrored, the scrim leaving last. Focus goes back
// where it was. Children mark what resolves with data-i. Every dialog sits on the same line under the
// top bar (pops.css); size picks its width: sm 440 a question, md 640 a form, lg 860 Probar.
export type DialogSize = 'sm' | 'md' | 'lg';
type DialogProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  size?: DialogSize;
  className?: string;
  children: ReactNode;
};

export function Dialog({ open, label, onClose, size = 'sm', className, children }: DialogProps) {
  const [mounted, setMounted] = useState(open);
  const el = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);
  const focusBack = useRef<HTMLElement | null>(null);
  if (open && !mounted) setMounted(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (open) {
      if (!choreo.current) {
        focusBack.current = document.activeElement as HTMLElement | null;
        const items = [...node.querySelectorAll('[data-i]')];
        choreo.current = new Choreo([
          part(scrim.current, { opacity: 0 }, { opacity: 1 }, 360, 'drift', 0),
          part(
            node.querySelector('.pline'),
            { transform: 'scaleX(0.001)' },
            { transform: 'scaleX(1)' },
            320,
            'glide',
            40,
          ),
          part(
            node.querySelector('.psurf'),
            { clipPath: 'inset(0px -40px 100% -40px)' },
            { clipPath: 'inset(0px -40px -40px -40px)' },
            480,
            'settle',
            90,
          ),
          part(
            node.querySelector('.pin'),
            { transform: 'translateY(-10px)' },
            { transform: 'translateY(0px)' },
            480,
            'settle',
            90,
          ),
          part(
            node,
            { transform: 'translateY(6px)' },
            { transform: 'translateY(0px)' },
            480,
            'settle',
            90,
          ),
          ...items.flatMap((x, i) => {
            const d = 160 + 34 * Math.min(i, 5);
            return [
              part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d),
              part(
                x,
                { transform: 'translateY(-4px)' },
                { transform: 'translateY(0px)' },
                380,
                'glide',
                d,
              ),
              part(x, { filter: 'blur(1px)' }, { filter: 'blur(0px)' }, 260, 'drift', d),
            ];
          }),
          part(node, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
        ]);
        focusFirst(node);
      }
      choreo.current.go(1);
    } else if (choreo.current) {
      const ch = choreo.current;
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0) {
          choreo.current = null;
          setMounted(false);
          focusBack.current?.focus?.({ preventScroll: true });
        }
      });
    }
  }, [open, mounted]);

  useEscape(open, 'dialog', onClose);

  if (!mounted) return null;
  const dialog = (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the scrim is a press outside, Escape closes too */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard's way out */}
      <div ref={scrim} className="scrim" onClick={onClose} />
      <div
        ref={el}
        className={['pop', 'e-top', 'dialog', size === 'sm' ? '' : `d-${size}`, className]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(e) => onDialogTab(e.currentTarget, e.nativeEvent)}
      >
        <i className="pline">
          <i className="glint" />
        </i>
        <div className="psurf">
          <div className="pin">{children}</div>
        </div>
      </div>
    </>
  );
  const layer = layerEl();
  return layer ? createPortal(dialog, layer) : dialog;
}
