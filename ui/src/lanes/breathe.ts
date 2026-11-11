import { clamp, F } from '../motion/curves.ts';
import { drive } from '../motion/drive.ts';
import { reduced } from '../motion/reduced.ts';

const NS = 'http://www.w3.org/2000/svg';
const breaths = new WeakMap<SVGSVGElement, Record<number, SVGLineElement[]>>();

function line(color: string, width: number, blur: boolean): SVGLineElement {
  const l = document.createElementNS(NS, 'line');
  l.setAttribute('stroke', color);
  l.setAttribute('stroke-width', String(width));
  l.setAttribute('stroke-linecap', 'round');
  if (blur) l.style.filter = 'blur(2.5px)';
  return l;
}

// A state change ripples along its lane: two soft lights leave the node, up and down, and fade
// (SPEC §4.7, mock:2052-2070). One breath per lane x at a time: a new one fades the old in 120 ms.
// Reach 150 (yours, agents), 90 (closed), stuck 110 at k 0.8.
export function breathe(
  svg: SVGSVGElement | null,
  x: number,
  y: number,
  color: string,
  H: number,
  reach = 150,
  k = 1,
  horizontal = false,
): void {
  if (reduced() || !svg) return;
  const fx = svg.querySelector('.fx') ?? svg;
  const prev = breaths.get(svg);
  for (const s of prev?.[x] ?? []) {
    s.animate([{ opacity: s.getAttribute('opacity') ?? 0.5 }, { opacity: 0 }], {
      duration: 120,
      fill: 'forwards',
    });
  }
  const segs = [0, 1].map(() => [line(color, 6, true), line(color, 1.6, false)] as const);
  for (const pair of segs) for (const s of pair) fx.appendChild(s);
  const map = prev ?? {};
  map[x] = segs.flat();
  breaths.set(svg, map);
  drive(820, (u) => {
    const d = reach * F.glide(u);
    const a = (1 - u) ** 1.5 * k;
    const half = 16 * (1 - 0.4 * u);
    segs.forEach(([gl, ln], i) => {
      const c = i ? y + d : y - d;
      const a1 = clamp(c - half, 0, H);
      const a2 = clamp(c + half, 0, H);
      for (const s of [gl, ln]) {
        if (horizontal) {
          s.setAttribute('x1', String(a1));
          s.setAttribute('x2', String(a2));
          s.setAttribute('y1', String(x));
          s.setAttribute('y2', String(x));
        } else {
          s.setAttribute('x1', String(x));
          s.setAttribute('x2', String(x));
          s.setAttribute('y1', String(a1));
          s.setAttribute('y2', String(a2));
        }
      }
      gl.setAttribute('opacity', (0.38 * a).toFixed(3));
      ln.setAttribute('opacity', (0.75 * a).toFixed(3));
    });
    if (u >= 1) for (const s of segs.flat()) s.remove();
  });
}
