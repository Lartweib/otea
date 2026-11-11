import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/i18n.ts';
import { useEscape } from '../kit/escape.ts';
import { Icon } from '../kit/Icon.tsx';
import { layerEl } from '../kit/pop/Pop.tsx';
import { Choreo } from '../motion/choreo.ts';
import { C, clamp } from '../motion/curves.ts';
import { type Drive, drive } from '../motion/drive.ts';
import { reduced } from '../motion/reduced.ts';
import { spring } from '../motion/spring.ts';
import { type DragState, dragFrame, dragStart, release } from './drag.ts';
import { sheetParts } from './sheet-parts.ts';

// A sheet from below, for the phone (SPEC §10.7, mock:3581-3616): the scrim fades in, the sheet
// rises from past its edge, the grab draws, its [data-i] items resolve; the close is that gesture
// mirrored. The finger can take it at any point: it follows down, resists up, scrolls a tall
// sheet's content first, goes on a flick or past 30%, and otherwise settles back with the
// velocity it was let go at. It stays mounted while it closes.

type BottomSheetProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  // After the close has finished and the sheet is gone.
  onClosed?: () => void;
  // A head with the title and a close button; without it the sheet is only its content.
  title?: ReactNode;
  className?: string;
  children: ReactNode;
};

const BACK = 480;

// The sheet's translateY on screen now, whatever moves it (a running part, a drag, a settle).
function currentY(el: HTMLElement): number {
  const tr = getComputedStyle(el).transform;
  if (!tr || tr === 'none') return 0;
  return new DOMMatrixReadOnly(tr).m42;
}

export function BottomSheet({
  open,
  label,
  onClose,
  onClosed,
  title,
  className,
  children,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);
  const focusBack = useRef<HTMLElement | null>(null);
  const settling = useRef<Drive | null>(null);
  const leaving = useRef<{ anims: Animation[]; done: Promise<unknown> } | null>(null);
  const press = useRef<{ id: number; s: DragState; drag: boolean } | null>(null);
  const swallow = useRef(false);
  const closed = useRef(onClosed);
  closed.current = onClosed;
  if (open && !mounted) setMounted(true);

  const finish = () => {
    choreo.current = null;
    leaving.current = null;
    setMounted(false);
    focusBack.current?.focus?.({ preventScroll: true });
    closed.current?.();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el) return;
    if (open) {
      settling.current?.cancel();
      settling.current = null;
      if (leaving.current) {
        // Pressed again while a flick took it away: it comes back from where it is.
        const y = currentY(el);
        const o = scrim.current ? getComputedStyle(scrim.current).opacity : '1';
        for (const a of leaving.current.anims) a.cancel();
        leaving.current = null;
        el.style.transform = `translateY(${y}px)`;
        if (scrim.current) scrim.current.style.opacity = o;
      }
      if (!choreo.current) {
        focusBack.current = document.activeElement as HTMLElement | null;
        choreo.current = new Choreo(
          sheetParts({
            scrim: scrim.current,
            sheet: el,
            grab: el.querySelector('.grab'),
            items: [...el.querySelectorAll('[data-i]')],
          }),
        );
        el.focus({ preventScroll: true });
      }
      choreo.current.go(1);
      el.style.transform = '';
      if (scrim.current) scrim.current.style.opacity = '';
    } else if (leaving.current) {
      const l = leaving.current;
      l.done.then(() => {
        if (leaving.current === l) finish();
      });
    } else if (choreo.current) {
      settling.current?.cancel();
      settling.current = null;
      el.style.transform = '';
      if (scrim.current) scrim.current.style.opacity = '';
      const ch = choreo.current;
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0 && choreo.current === ch) finish();
      });
    }
  }, [open, mounted]);

  useEffect(
    () => () => {
      settling.current?.cancel();
      choreo.current?.cancel();
    },
    [],
  );

  useEscape(open, 'dialog', onClose);

  const write = (y: number) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transform = `translateY(${y}px)`;
    if (scrim.current) scrim.current.style.opacity = String(1 - clamp(y / (el.offsetHeight || 1)));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = sheet.current;
    if (!el || !open || e.button !== 0) return;
    swallow.current = false;
    press.current = {
      id: e.pointerId,
      drag: false,
      s: dragStart(
        e.clientY,
        e.timeStamp,
        { scroll: el.scrollTop, max: el.scrollHeight - el.clientHeight },
        currentY(el),
      ),
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    const el = sheet.current;
    if (!p || !el || p.id !== e.pointerId) return;
    const f = dragFrame(p.s, e.clientY, e.timeStamp);
    if (!f.state.moved) return;
    if (!p.drag) {
      // From here it is a drag, not a press: the finger takes the sheet where it is.
      p.drag = true;
      settling.current?.cancel();
      settling.current = null;
      choreo.current?.cancel();
      el.setPointerCapture?.(e.pointerId);
    }
    p.s = f.state;
    el.scrollTop = f.scroll;
    write(f.y);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    const el = sheet.current;
    press.current = null;
    if (!p || !el || !p.drag || p.id !== e.pointerId) return;
    swallow.current = true;
    const y = p.s.last;
    const v = p.s.v;
    const H = el.offsetHeight;
    const R = reduced();
    if (release(y, v, H) === 'dismiss') {
      const o = scrim.current ? Number(getComputedStyle(scrim.current).opacity) : 1;
      const anims = [
        R
          ? el.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 160,
              easing: C.drift,
              fill: 'forwards',
            })
          : el.animate(
              [{ transform: `translateY(${y}px)` }, { transform: `translateY(${H + 2}px)` }],
              {
                duration: 480,
                easing: C.settle,
                fill: 'forwards',
              },
            ),
      ];
      if (scrim.current)
        anims.push(
          scrim.current.animate([{ opacity: o }, { opacity: 0 }], {
            duration: R ? 160 : 360,
            easing: C.drift,
            fill: 'forwards',
          }),
        );
      el.style.transform = '';
      if (scrim.current) scrim.current.style.opacity = '';
      leaving.current = { anims, done: Promise.all(anims.map((a) => a.finished)).catch(() => {}) };
      onClose();
      return;
    }
    if (R) {
      el.style.transform = '';
      if (scrim.current) scrim.current.style.opacity = '';
      return;
    }
    // Back where it rests, keeping the speed it was let go at.
    const at = spring(y, 0, v, BACK);
    settling.current = drive(BACK, (k, t) => {
      if (k >= 1) {
        el.style.transform = '';
        if (scrim.current) scrim.current.style.opacity = '';
        settling.current = null;
        return;
      }
      write(at(t).x);
    });
  };

  if (!mounted) return null;
  const node = (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the scrim is a press outside, Escape closes too */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard's way out */}
      <div ref={scrim} className="scrim" onClick={onClose} />
      <div
        ref={sheet}
        className={['nsheet', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // A drag that ends on a row is not a press on it.
          if (!swallow.current) return;
          swallow.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="grab" aria-hidden="true" />
        {title === undefined ? null : (
          <div className="nsheet-head" data-i="">
            <span className="nsheet-title">{title}</span>
            <button type="button" className="ibtn" aria-label={t('phone.close')} onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  );
  const layer = layerEl();
  return layer ? createPortal(node, layer) : node;
}
