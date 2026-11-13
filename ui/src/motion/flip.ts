import { C } from './curves.ts';
import { reduced } from './reduced.ts';

// FLIP from the visual rect (mock:1082-1124, MOTION §5.2): measured before anything is cancelled,
// so a FLIP started mid-FLIP continues from what is on screen.

const fxl = (): HTMLElement | null => document.querySelector<HTMLElement>('.main > .fxl');

// The font size an element shows at, its running scale included.
function fsOf(e: HTMLElement, r: DOMRect): number {
  return (
    parseFloat(getComputedStyle(e).fontSize) * (e.offsetHeight ? r.height / e.offsetHeight : 1)
  );
}

const isShown = (r: DOMRect) => r.width > 0 || r.height > 0;

const COPIED = [
  'font',
  'color',
  'letterSpacing',
  'textTransform',
  'fontVariationSettings',
  'whiteSpace',
  'textWrap',
  'lineHeight',
] as const;

type Styles = Record<string, string>;

// A copy of el, frozen where it stands, in the layer: what stays behind when el leaves.
export function ghostOf(
  el: HTMLElement,
  layer: HTMLElement | null = fxl(),
  rect: DOMRect = el.getBoundingClientRect(),
): HTMLElement {
  const host = layer ?? document.body;
  const lr = host.getBoundingClientRect();
  const cs = getComputedStyle(el) as unknown as Styles;
  const g = el.cloneNode(true) as HTMLElement;
  const gs = g.style as unknown as Styles;
  for (const p of COPIED) gs[p] = cs[p] ?? '';
  Object.assign(g.style, {
    position: 'absolute',
    left: `${rect.left - lr.left}px`,
    top: `${rect.top - lr.top}px`,
    width: `${rect.width}px`,
    margin: '0',
    pointerEvents: 'none',
    transform: 'none',
  });
  g.removeAttribute('data-s');
  g.removeAttribute('data-k');
  const src = [...el.querySelectorAll<HTMLElement>('*')].slice(0, 24);
  const dst = [...g.querySelectorAll<HTMLElement>('*')].slice(0, 24);
  src.forEach((s, i) => {
    const c = getComputedStyle(s) as unknown as Styles;
    const d = dst[i]?.style as unknown as Styles | undefined;
    if (d)
      for (const p of ['display', 'font', 'color', 'marginTop', 'whiteSpace']) d[p] = c[p] ?? '';
  });
  host.appendChild(g);
  return g;
}

type Edge = { left: number; top: number; width: number };

// Where a leaf starts: where it stood, at the size its text showed. A rule (data-leaf="w") also
// starts at its old width, so it stretches with what it underlines instead of snapping.
export function flipStart(a: Edge, b: Edge, s: number, stretch: boolean): string | null {
  const dx = a.left - b.left;
  const dy = a.top - b.top;
  const sx = stretch && b.width > 0 ? a.width / b.width : s;
  if (Math.abs(dx) + Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.004 && Math.abs(sx - 1) < 0.004)
    return null;
  return `translate(${dx}px, ${dy}px) ${stretch ? `scale(${sx}, ${s})` : `scale(${s})`}`;
}

// A leaf whose width changes cannot slide at its new width from where it stood without running
// over what is beside it: it changes in place instead (flipLeaves' `swap`).
export const changesShape = (a: Edge, b: Edge): boolean => Math.abs(a.width - b.width) > 1;

export type FlipOptions = {
  T?: number;
  delay?: number;
  outT?: number;
  inDelay?: number;
  inT?: number;
  layer?: HTMLElement;
  noScale?: boolean;
  // Leaves that, when their width changes, dissolve where they stood and resolve where they land,
  // one after the other, instead of sliding.
  swap?: (e: HTMLElement) => boolean;
};

// Moves every element from where it is on screen to where `mutate` puts it. One that stops showing
// leaves a ghost that dissolves where it stood; one that starts showing resolves late.
export function flipLeaves(
  els: HTMLElement[],
  mutate: () => void,
  opts: FlipOptions = {},
): { e: HTMLElement; kf: Keyframe[] }[] {
  const {
    T = 560,
    delay = 0,
    outT = 220,
    inDelay = 380,
    inT = 220,
    layer,
    noScale = false,
    swap,
  } = opts;
  const A = els.map((e) => {
    const r = e.getBoundingClientRect();
    const vis = isShown(r);
    // What it looks like now, in case it changes shape: a copy made after the change would not be.
    const was = vis && swap?.(e) ? ghostOf(e, layer ?? fxl(), r) : null;
    return { e, r, vis, was, fs: fsOf(e, r), op: +getComputedStyle(e).opacity };
  });
  for (const e of els) {
    for (const a of e.getAnimations()) if (a.id === 'flip' || a.id === 'fin') a.cancel();
  }
  mutate();
  const R = reduced();
  const out: { e: HTMLElement; kf: Keyframe[] }[] = [];
  for (const a of A) {
    const b = a.e.getBoundingClientRect();
    const visB = isShown(b);
    const was = a.was;
    if (was && visB && changesShape(a.r, b)) {
      const out = was.animate(
        [
          { opacity: a.op, filter: 'blur(0px)' },
          { opacity: 0, filter: R ? 'blur(0px)' : 'blur(1.5px)' },
        ],
        { duration: R ? 160 : outT, delay: R ? 0 : delay, easing: C.drift, fill: 'both' },
      );
      out.finished.then(
        () => was.remove(),
        () => was.remove(),
      );
      const an = a.e.animate(
        [
          { opacity: 0, filter: R ? 'blur(0px)' : 'blur(1.5px)' },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        {
          duration: R ? 160 : inT,
          delay: R ? 0 : delay + outT,
          easing: C.drift,
          fill: 'backwards',
        },
      );
      an.id = 'fin';
      continue;
    }
    was?.remove();
    if (a.vis && visB) {
      if (R) continue;
      const fb = parseFloat(getComputedStyle(a.e).fontSize);
      const s = noScale ? 1 : a.fs / fb;
      const from = flipStart(a.r, b, s, a.e.dataset.leaf === 'w');
      if (!from) continue;
      const kf: Keyframe[] = [
        { transform: from, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' },
      ];
      const an = a.e.animate(kf, { duration: T, delay, easing: C.settle, fill: 'backwards' });
      an.id = 'flip';
      out.push({ e: a.e, kf });
    } else if (a.vis && !visB && a.op > 0.02) {
      const g = ghostOf(a.e, layer ?? fxl(), a.r);
      const an = g.animate(
        [
          { opacity: a.op, filter: 'blur(0px)' },
          { opacity: 0, filter: R ? 'blur(0px)' : 'blur(1.5px)' },
        ],
        { duration: R ? 160 : outT, easing: C.drift, fill: 'both' },
      );
      an.finished.then(
        () => g.remove(),
        () => g.remove(),
      );
    } else if (!a.vis && visB) {
      const an = a.e.animate(
        [
          { opacity: 0, filter: R ? 'blur(0px)' : 'blur(1.5px)' },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: R ? 160 : inT, delay: R ? 0 : inDelay, easing: C.drift, fill: 'backwards' },
      );
      an.id = 'fin';
    }
  }
  return out;
}
