import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/i18n.ts';
import { Choreo, part } from '../../motion/choreo.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { layerEl } from './Pop.tsx';

// Toasts (mock:3423-3469, MOTION §3.3): one surface at the foot of the page. A second message
// replaces the first in place (the old one up, the new from below, a glint along the line) and
// restarts the dwell. 12 s, paused while hovered or focused. Deshacer closes it and undoes at once.

export type ToastOptions = { msg: ReactNode; id?: string; undo?: () => void; node?: boolean };

type Shown = ToastOptions & { seq: number };

const DWELL = 12_000;
let seqN = 0;
let latest: Shown | null = null;
const listeners = new Set<() => void>();

export function toast(o: ToastOptions): void {
  latest = { ...o, seq: ++seqN };
  for (const fn of listeners) fn();
}

// The last toast sent so far. A host that mounts later (back from Customize, which has none)
// starts past it, so it shows only what is sent from then on.
export const seenAtMount = (): number => latest?.seq ?? 0;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

type Msg = { seq: number; msg: ReactNode; id?: string | undefined; out?: boolean };

export function ToastHost() {
  const next = useSyncExternalStore(
    subscribe,
    () => latest,
    () => null,
  );
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [undo, setUndo] = useState<(() => void) | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);
  // Sweeps the outgoing message; cleared when the host goes.
  const sweep = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(sweep.current), []);
  const seen = useRef(seenAtMount());
  const dwell = useRef({ left: DWELL, t0: 0, timer: 0 });
  const replaced = useRef(false);
  const pendingNode = useRef(false);

  const close = () => {
    clearTimeout(dwell.current.timer);
    const ch = choreo.current;
    if (!ch) return;
    ch.go(0).then((cur) => {
      if (cur && ch.dir === 0) {
        choreo.current = null;
        setMounted(false);
        setMsgs([]);
      }
    });
  };
  const arm = () => {
    clearTimeout(dwell.current.timer);
    dwell.current.t0 = performance.now();
    dwell.current.timer = window.setTimeout(close, dwell.current.left);
  };
  const pause = () => {
    clearTimeout(dwell.current.timer);
    dwell.current.left = Math.max(
      1200,
      dwell.current.left - (performance.now() - dwell.current.t0),
    );
  };

  // A new toast: open the surface, or replace the message in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on each new toast only
  useEffect(() => {
    if (!next || next.seq === seen.current) return;
    seen.current = next.seq;
    setUndo(() => next.undo);
    const showing = mounted && choreo.current?.dir === 1;
    replaced.current = showing;
    pendingNode.current = !!next.node;
    setMsgs((was) =>
      showing
        ? [
            ...was.filter((m) => !m.out).map((m) => ({ ...m, out: true })),
            { seq: next.seq, msg: next.msg, id: next.id },
          ]
        : [{ seq: next.seq, msg: next.msg, id: next.id }],
    );
    setMounted(true);
    dwell.current.left = DWELL;
    arm();
  }, [next]);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !msgs.length) return;
    const R = reduced();
    const box = node.querySelector<HTMLElement>('.msgs');
    const ub = node.querySelector<HTMLElement>('[data-undo]');
    if (!choreo.current) {
      const fades = [box, ub].flatMap((x, i) => {
        const d = i ? 164 : 130;
        return [
          part(x, { opacity: 0 }, { opacity: 1 }, 360, 'drift', d),
          part(x, { filter: 'blur(1px)' }, { filter: 'blur(0px)' }, 300, 'drift', d),
          part(
            x,
            { transform: 'translateY(-3px)' },
            { transform: 'translateY(0px)' },
            400,
            'glide',
            d,
          ),
        ];
      });
      choreo.current = new Choreo([
        part(
          node.querySelector('.pline'),
          { transform: 'scaleX(0.001)' },
          { transform: 'scaleX(1)' },
          300,
          'glide',
          0,
        ),
        part(
          node.querySelector('.psurf'),
          { clipPath: 'inset(0px -40px 100% -40px)' },
          { clipPath: 'inset(0px -40px -40px -40px)' },
          460,
          'settle',
          50,
        ),
        part(
          node.querySelector('.pin'),
          { transform: 'translateY(-8px)' },
          { transform: 'translateY(0px)' },
          460,
          'settle',
          50,
        ),
        ...fades,
        part(node, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
      ]);
      choreo.current.go(1);
    } else if (choreo.current.dir === 0) choreo.current.go(1);
    if (replaced.current) {
      replaced.current = false;
      const old =
        node.querySelector<HTMLElement>('.tmsg.out:last-of-type') ??
        node.querySelector<HTMLElement>('.tmsg.out');
      const nw = node.querySelector<HTMLElement>('.tmsg:not(.out)');
      if (R) {
        old?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 160,
          easing: C.drift,
          fill: 'forwards',
        });
        nw?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: C.drift });
      } else {
        old?.animate(
          [
            { transform: 'translateY(0px)', filter: 'blur(0px)', opacity: 1 },
            { transform: 'translateY(-6px)', filter: 'blur(1px)', opacity: 0 },
          ],
          { duration: 260, easing: C.glide, fill: 'forwards' },
        );
        nw?.animate(
          [
            { transform: 'translateY(6px)', filter: 'blur(1px)', opacity: 0 },
            { transform: 'translateY(0px)', filter: 'blur(0px)', opacity: 1 },
          ],
          { duration: 380, delay: 90, easing: C.glide, fill: 'backwards' },
        );
        const W = node.offsetWidth;
        node.querySelector('.glint')?.animate(
          [
            { transform: 'translateX(-70px)', opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { opacity: 1, offset: 0.7 },
            { transform: `translateX(${W}px)`, opacity: 0 },
          ],
          { duration: 720, easing: C.drift },
        );
      }
      clearTimeout(sweep.current);
      sweep.current = window.setTimeout(() => setMsgs((was) => was.filter((m) => !m.out)), 400);
    }
    if (pendingNode.current && !R) {
      pendingNode.current = false;
      const n = node.querySelector<HTMLElement>('.tnode');
      const W = node.offsetWidth;
      n?.animate(
        [
          { transform: 'translateX(0px)', opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { transform: `translateX(${W - 12}px)`, opacity: 1, offset: 0.85 },
          { transform: `translateX(${W - 12}px)`, opacity: 0 },
        ],
        { duration: 760, delay: 120, easing: C.ink, fill: 'both' },
      );
    }
  }, [msgs]);

  useEffect(() => () => clearTimeout(dwell.current.timer), []);

  if (!mounted) return null;
  const surface = (
    <div
      ref={el}
      className="pop e-top toast"
      role="status"
      aria-live="polite"
      onMouseEnter={pause}
      onMouseLeave={arm}
      onFocus={pause}
      onBlur={arm}
    >
      <i className="pline">
        <i className="glint" />
      </i>
      <div className="psurf">
        <div className="pin">
          <span className="msgs">
            {msgs.map((m) => (
              <p key={m.seq} className={m.out ? 'tmsg out' : 'tmsg'}>
                {m.id ? <span className="id">{m.id}</span> : null}
                {m.msg}
              </p>
            ))}
          </span>
          <button
            type="button"
            className="btn quiet sm"
            data-undo=""
            hidden={!undo}
            onClick={() => {
              const f = undo;
              close();
              f?.();
            }}
          >
            {t('toast.undo')}
          </button>
        </div>
      </div>
      <i className="tnode" aria-hidden="true">
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <circle r="4" fill="var(--you)" />
        </svg>
      </i>
    </div>
  );
  const layer = layerEl();
  return layer ? createPortal(surface, layer) : surface;
}
