import { C, clamp, F } from '../motion/curves.ts';
import { reduced } from '../motion/reduced.ts';

// Where the pen is (0..1 of its time) when it has drawn `frac` of the line.
export function inkAt(frac: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (F.ink(m) < frac) lo = m;
    else hi = m;
  }
  return hi;
}

const svgOf = (list: HTMLElement) => list.querySelector<SVGSVGElement>(':scope > svg.ink');

// The lanes draw in with their list (SPEC §4.5, mock:2002-2021): the lines draw top to bottom on
// ink, the light fades in behind them, the branches after, and every block within sight resolves
// when the ink head reaches it. The first thing a person sees.
export function drawIn(
  list: HTMLElement | null,
  { delay = 140, T = 640, scope }: { delay?: number; T?: number; scope?: HTMLElement } = {},
): void {
  if (!list || reduced()) return;
  const svg = svgOf(list);
  if (!svg) return;
  const H = Math.max(1, list.offsetHeight);
  const paths = [...svg.querySelectorAll<SVGPathElement>('.lines .ln')];
  for (const p of paths) {
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1';
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: T,
      delay,
      easing: C.ink,
      fill: 'backwards',
    }).finished.then(
      () => {
        p.removeAttribute('pathLength');
        p.style.strokeDasharray = '';
      },
      () => undefined,
    );
  }
  svg.querySelector('.glow')?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 600,
    delay: delay + T * 0.6,
    easing: C.drift,
    fill: 'backwards',
  });
  svg.querySelector('.branch')?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 300,
    delay: delay + T * 0.7,
    easing: C.drift,
    fill: 'backwards',
  });
  const vh = (scope ?? list.closest<HTMLElement>('.view') ?? list).getBoundingClientRect();
  const lr = list.getBoundingClientRect();
  for (const el of list.children) {
    if (!(el instanceof HTMLElement) || !el.dataset.k || el.classList.contains('ghost')) continue;
    const y = el.offsetTop + 10;
    if (lr.top + el.offsetTop > vh.bottom + 40) continue;
    const d = delay + T * inkAt(clamp((y - 8) / H));
    el.animate(
      [
        { opacity: 0, transform: 'translateX(-4px)', filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 380, delay: d, easing: C.glide, fill: 'backwards' },
    );
  }
}

// The lanes undraw from the bottom up as their list leaves (mock:2022-2026).
export function retract(list: HTMLElement | null, T = 360): void {
  if (!list || reduced()) return;
  const svg = svgOf(list);
  if (!svg) return;
  for (const p of svg.querySelectorAll<SVGPathElement>('.lines .ln')) {
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1';
    p.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }], {
      duration: T,
      easing: C.ink,
      fill: 'forwards',
    });
  }
}
