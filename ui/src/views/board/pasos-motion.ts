import { C, F } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { Tt } from '../../motion/time.ts';

// Pasos' own motion (SPEC §5.3, §10.1): a data change is the handoff's carry in two dimensions
// (pasosTransition, mock:2268-2296) and the columns trace in when Pasos appears (revealCols,
// mock:2387-2393).

export type CardSnap = Map<
  string,
  { el: HTMLElement; x: number; y: number; w: number; col: string; h: string }
>;

// Every card where it stands, relative to the columns (their scroll included).
export function snapCards(cols: HTMLElement): CardSnap {
  const cr = cols.getBoundingClientRect();
  const m: CardSnap = new Map();
  for (const c of cols.querySelectorAll<HTMLElement>('.cards > .card[data-k]')) {
    const r = c.getBoundingClientRect();
    m.set(c.dataset.k ?? '', {
      el: c,
      x: r.left - cr.left + cols.scrollLeft,
      y: r.top - cr.top,
      w: r.width,
      col: c.closest<HTMLElement>('.col')?.dataset.col ?? '',
      h: c.dataset.h ?? '',
    });
  }
  return m;
}

// A card that changes column or turn lifts in a bell and sets down slowly; the others make room
// 40 ms later; new cards resolve at 260; gone cards leave as ghosts (the detached card, put back
// where it stood). A is the snapshot from before the change; the change is already in the DOM.
export function pasosTransition(cols: HTMLElement, A: CardSnap): Promise<void> {
  const R = reduced();
  const B = snapCards(cols);
  const out: Promise<unknown>[] = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const a = A.get(k);
    const b = B.get(k);
    if (a && b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.5) continue;
      if (R) {
        b.el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160, easing: C.drift });
        continue;
      }
      const moved = a.col !== b.col || a.h !== b.h;
      const T = Tt.travel(Math.hypot(dx, dy));
      if (moved) b.el.style.zIndex = '5';
      const kf: Keyframe[] = [];
      for (let i = 0; i <= 12; i++) {
        const s = i / 12;
        const p = F.settle(s);
        const bb = moved ? Math.sin(Math.PI * p) : 0;
        kf.push({
          offset: s,
          transform: `translate(${dx * (1 - p)}px, ${dy * (1 - p) - 5 * bb}px)`,
          boxShadow: `0 ${(14 * bb).toFixed(1)}px ${(28 * bb).toFixed(1)}px -${(14 * bb).toFixed(1)}px color-mix(in oklch, var(--shadow) ${(bb * 100).toFixed(0)}%, transparent)`,
        });
      }
      out.push(
        b.el
          .animate(kf, { duration: T, delay: moved ? 0 : 40, easing: 'linear', fill: 'backwards' })
          .finished.catch(() => undefined),
      );
    } else {
      const shown = [
        { opacity: 0, transform: 'translateY(-4px)', filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ];
      if (b) {
        out.push(
          b.el
            .animate(shown, {
              duration: R ? 160 : 380,
              delay: R ? 0 : 260,
              easing: C.glide,
              fill: 'both',
            })
            .finished.catch(() => undefined),
        );
      } else if (a) {
        const g = a.el;
        g.classList.add('ghost');
        g.style.cssText = `position:absolute;left:${a.x}px;top:${a.y}px;width:${a.w}px;pointer-events:none;margin:0`;
        cols.appendChild(g);
        out.push(
          g
            .animate([...shown].reverse(), {
              duration: R ? 160 : 240,
              easing: C.glide,
              fill: 'both',
            })
            .finished.then(() => g.remove())
            .catch(() => g.remove()),
        );
      }
    }
  }
  return Promise.all(out).then(() => {
    for (const c of cols.querySelectorAll<HTMLElement>('.card')) c.style.zIndex = '';
  });
}

// Pasos appears: each column traces its rule, then its head and cards resolve, column by column.
export function revealCols(cols: HTMLElement, delay = 0): void {
  if (reduced()) return;
  cols.querySelectorAll<HTMLElement>('.col').forEach((col, ci) => {
    col.querySelector('.rule')?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: 420,
      delay: delay + 60 * ci,
      easing: C.ink,
      fill: 'backwards',
    });
    const bits = [
      col.querySelector('.colh h3'),
      col.querySelector('.colh .n'),
      ...col.querySelectorAll('.card'),
    ];
    bits.forEach((e, i) => {
      e?.animate(
        [
          { opacity: 0, transform: 'translateY(4px)', filter: 'blur(1px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        {
          duration: 380,
          delay: delay + 60 + 60 * ci + 26 * Math.min(i, 6),
          easing: C.glide,
          fill: 'backwards',
        },
      );
    });
  });
}
