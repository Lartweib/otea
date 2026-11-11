import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Choreo, type Part, part } from '../../motion/choreo.ts';
import { clamp } from '../../motion/curves.ts';
import { useEscape } from '../escape.ts';
import { type Place, placer } from './anchors.ts';
import { focusFirst, onMenuKey } from './focus.ts';

// A pop: the line leads from the trigger, the surface unrolls riding its edge, the items resolve
// (mock:3258-3291, MOTION §3.1). It stays mounted while it closes, the same gesture mirrored, and
// a press on its trigger mid-close brings it back from where it is. One is open at a time.

export type PopEdge = 'top' | 'bottom';

type PopProps = {
  open: boolean;
  anchor?: HTMLElement | null;
  edge?: PopEdge;
  place?: Place;
  role?: 'menu' | 'dialog' | 'status';
  label?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

type PopApi = { close(): void };

export const PopContext = createContext<PopApi>({ close: () => undefined });
export const usePop = (): PopApi => useContext(PopContext);

// The one pop open now.
let openPop: { id: object; close: () => void } | null = null;

// The parts of a pop's gesture (mock:3271-3277), for a pop's element.
export function popParts(el: HTMLElement, edge: PopEdge): Part[] {
  const top = edge === 'top';
  const line = el.querySelector(':scope > .pline');
  const surf = el.querySelector(':scope > .psurf');
  const pin = el.querySelector(':scope > .psurf > .pin');
  const items = [...el.querySelectorAll('[data-i]')];
  return [
    part(line, { transform: 'scaleX(0.001)' }, { transform: 'scaleX(1)' }, 280, 'glide', 0),
    part(
      surf,
      { clipPath: top ? 'inset(0px -40px 100% -40px)' : 'inset(100% -40px 0px -40px)' },
      { clipPath: top ? 'inset(0px -40px -40px -40px)' : 'inset(-40px -40px 0px -40px)' },
      440,
      'settle',
      50,
    ),
    part(
      pin,
      { transform: `translateY(${top ? -10 : 10}px)` },
      { transform: 'translateY(0px)' },
      440,
      'settle',
      50,
    ),
    ...items.flatMap((x, i) => {
      const d = 80 + 34 * Math.min(i, 5);
      return [
        part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d),
        part(
          x,
          { transform: `translateY(${top ? -4 : 4}px)` },
          { transform: 'translateY(0px)' },
          380,
          'glide',
          d,
        ),
        part(x, { filter: 'blur(1px)' }, { filter: 'blur(0px)' }, 260, 'drift', d),
      ];
    }),
    part(el, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
  ];
}

export function layerEl(): HTMLElement | null {
  return typeof document === 'undefined'
    ? null
    : (document.getElementById('layer') ?? document.body);
}

export function Pop({
  open,
  anchor = null,
  edge = 'top',
  place = 'below-left',
  role = 'menu',
  label,
  className,
  onClose,
  children,
}: PopProps) {
  const [mounted, setMounted] = useState(open);
  const el = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);
  const me = useRef({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  if (open && !mounted) setMounted(true);

  // Open: place it, lead the line from the trigger's centre, run the gesture. Close: the mirror,
  // then unmount if nothing reopened it meanwhile.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (open) {
      if (!choreo.current) {
        placer(place, anchor)?.(node);
        const line = node.querySelector<HTMLElement>(':scope > .pline');
        if (line) {
          if (anchor) {
            const tr = anchor.getBoundingClientRect();
            const er = node.getBoundingClientRect();
            line.style.transformOrigin = `${clamp(tr.left + tr.width / 2 - er.left, 0, er.width)}px 0`;
          } else line.style.transformOrigin = '50% 0';
        }
        choreo.current = new Choreo(popParts(node, edge));
        // Portalled to the end of the document: it takes focus, or Tab would skip it.
        if (role !== 'status') focusFirst(node);
      }
      if (openPop && openPop.id !== me.current) openPop.close();
      openPop = { id: me.current, close: () => closeRef.current() };
      choreo.current.go(1);
    } else if (choreo.current) {
      if (openPop?.id === me.current) openPop = null;
      const ch = choreo.current;
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0) {
          choreo.current = null;
          setMounted(false);
        }
      });
    }
  }, [open, mounted]);

  // A menu moves by its arrows, Home and End.
  useEffect(() => {
    const node = el.current;
    if (!mounted || role !== 'menu' || !node) return;
    const key = (event: KeyboardEvent) => onMenuKey(node, event);
    node.addEventListener('keydown', key);
    return () => node.removeEventListener('keydown', key);
  }, [mounted, role]);

  // A press outside closes it.
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      const t = event.target as Node | null;
      if (!t || el.current?.contains(t) || anchor?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open, anchor]);

  useEffect(
    () => () => {
      if (openPop?.id === me.current) openPop = null;
    },
    [],
  );

  useEscape(open, 'pop', () => {
    closeRef.current();
    anchor?.focus({ preventScroll: true });
  });

  if (!mounted) return null;
  const pop = (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is a menu, a dialog or a status, all named
    <div
      ref={el}
      className={['pop', `e-${edge}`, className].filter(Boolean).join(' ')}
      role={role}
      aria-label={label}
    >
      <i className="pline">
        <i className="glint" />
      </i>
      <div className="psurf">
        <div className="pin">
          <PopContext.Provider value={{ close: () => closeRef.current() }}>
            {children}
          </PopContext.Provider>
        </div>
      </div>
    </div>
  );
  const layer = layerEl();
  return layer ? createPortal(pop, layer) : pop;
}
