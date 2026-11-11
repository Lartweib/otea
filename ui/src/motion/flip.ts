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

export type FlipOptions = {
  T?: number;
  delay?: number;
  outT?: number;
  inDelay?: number;
  inT?: number;
  layer?: HTMLElement;
  noScale?: boolean;
};

// Moves every element from where it is on screen to where `mutate` puts it. One that stops showing
// leaves a ghost that dissolves where it stood; one that starts showing resolves late.
export function flipLeaves(
  els: HTMLElement[],
  mutate: () => void,
  opts: FlipOptions = {},
): { e: HTMLElement; kf: Keyframe[] }[] {
  const { T = 560, delay = 0, outT = 220, inDelay = 380, inT = 220, layer, noScale = false } = opts;
  const A = els.map((e) => {
    const r = e.getBoundingClientRect();
    return { e, r, vis: isShown(r), fs: fsOf(e, r), op: +getComputedStyle(e).opacity };
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
    if (a.vis && visB) {
      if (R) continue;
      const fb = parseFloat(getComputedStyle(a.e).fontSize);
      const s = noScale ? 1 : a.fs / fb;
      const dx = a.r.left - b.left;
      const dy = a.r.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.004) continue;
      const kf: Keyframe[] = [
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: '0 0' },
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
