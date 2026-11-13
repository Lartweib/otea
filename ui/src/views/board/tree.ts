import { branchPaths, drawBranches, treeGeom } from '../../lanes/branch.ts';
import { redrawLists } from '../../lanes/dom.ts';
import { type LaneParams, lanePaths } from '../../lanes/geometry.ts';
import { listParams } from '../../lanes/handoff.ts';
import { drawLight } from '../../lanes/light.ts';
import { C, clamp, F, lerp } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { branchProgress, childResolve, revealAt, treeSpan, treeStepSpan } from './motion-math.ts';

// The tree fold (SPEC §10.1, MOTION §3.10, a port of mock:2298-2352): one ink head paints a
// parent's children in, top to bottom; each child resolves as the head reaches its node, the rows
// below make room on the same head, the lanes and the branch follow it. Folding runs the same head
// back, the same length. Pressed again mid-way, it turns back from where it is.
//
// The children are in the list either way (folded ones are `.ghost.folded`, out of the lanes), so a
// fold never changes the list's blocks: the caller shows them (unfold) before calling, and hides
// them in `onFolded` (fold) once the head is back.

type Job = {
  u: number;
  u0: number;
  target: 0 | 1;
  t0: number;
  done: boolean;
  raf: number;
  onFolded: () => void;
};

const jobs = new Map<string, Job>();

export function treeRunning(pid: string): boolean {
  const j = jobs.get(pid);
  return !!j && !j.done;
}

// Turns a running fold back; false when none runs.
export function reverseTree(pid: string): boolean {
  const j = jobs.get(pid);
  if (!j || j.done) return false;
  j.target = j.target === 1 ? 0 : 1;
  j.u0 = j.u;
  j.t0 = performance.now();
  return true;
}

function drawLanes(list: HTMLElement, p: LaneParams) {
  const svg = list.querySelector<SVGSVGElement>(':scope > svg.ink');
  if (!svg) return;
  const paths = lanePaths(p);
  const [lag, lyou, ltr] = svg.querySelectorAll('.lines .ln');
  lag?.setAttribute('d', paths.ag);
  lyou?.setAttribute('d', paths.you);
  ltr?.setAttribute('d', paths.trunk);
  ltr?.setAttribute('stroke', paths.trunkStroke);
  drawLight(svg, p);
}

// The sign on the fold button rolls when it turns (mock:2306).
export function rollSign(list: HTMLElement | null, pid: string) {
  const sg = list?.querySelector<HTMLElement>(`[data-fold="${CSS.escape(pid)}"] .sg`);
  if (!sg || reduced()) return;
  sg.animate(
    [
      { transform: 'translateY(60%)', opacity: 0, filter: 'blur(.8px)' },
      { transform: 'none', opacity: 1, filter: 'blur(0px)' },
    ],
    { duration: 360, easing: C.glide },
  );
}

// unfold: the children are shown already (the first frame hides them again, in the same task);
// fold: they are shown until the head is back, then onFolded hides them.
export function runTree(
  list: HTMLElement,
  pid: string,
  unfold: boolean,
  onFolded: () => void,
): void {
  if (reduced()) {
    const g = treeGeom(list, pid);
    for (const c of g?.ks ?? []) {
      c.el.animate([{ opacity: unfold ? 0 : 1 }, { opacity: unfold ? 1 : 0 }], {
        duration: 160,
        easing: C.drift,
        fill: unfold ? 'none' : 'forwards',
      });
    }
    if (!unfold) setTimeout(onFolded, 170);
    return;
  }
  const g = treeGeom(list, pid);
  if (!g?.ks.length) {
    if (!unfold) onFolded();
    return;
  }
  const first = g.ks[0];
  const last = g.ks[g.ks.length - 1];
  if (!first || !last) return;
  const B = listParams(list);
  const top = first.top;
  const Hc = g.ks.reduce((s, c) => s + c.h, 0);
  const bottom = top + Hc;
  const after = [...list.children].filter(
    (e): e is HTMLElement =>
      e instanceof HTMLElement &&
      !!e.dataset.k &&
      !e.classList.contains('ghost') &&
      e.offsetTop >= bottom - 1,
  );
  const Lh = last.cy - g.y0;
  const D = treeSpan(g.ks.length);
  const geo = { y0: g.y0, top, ks: g.ks };
  const frame = (u: number) => {
    const head = g.y0 + u * Lh;
    const Rm = revealAt(head, geo);
    for (const c of g.ks) {
      const cc = childResolve(head, c.cy);
      const lift = c.el.querySelector<HTMLElement>('.lift');
      if (lift) {
        lift.style.opacity = String(cc);
        lift.style.transform = `translateX(${-6 * (1 - cc)}px)`;
        lift.style.filter = `blur(${(1.2 * (1 - cc)).toFixed(2)}px)`;
      }
      c.el.style.clipPath = `inset(0px -40px ${Math.max(0, Math.min(c.h, c.top + c.h - (top + Rm)))}px -40px)`;
    }
    const shift = Rm - Hc;
    for (const e of after) e.style.transform = `translateY(${shift}px)`;
    const vy = (y: number) => (y < top ? y : y < bottom ? Math.min(y, top + Rm) : y + shift);
    drawLanes(list, {
      ...B,
      H: B.H + shift,
      lastOpen: vy(B.lastOpen),
      fuseAt: vy(B.fuseAt),
      pinches: B.pinches.map((k) => ({
        in: k.in === null ? null : vy(k.in),
        at: vy(k.at),
        end: vy(k.end),
        out: vy(k.out),
      })),
      ys: B.ys.map(vy),
      ws: B.ws.map(vy),
      as: B.as.map(vy),
      y0: B.y0 == null ? null : vy(B.y0),
      y1: B.y1 == null ? null : vy(B.y1),
    });
    const prog = branchProgress(head, geo);
    drawBranches(list, { pid, html: branchPaths(g, prog) });
  };
  const old = jobs.get(pid);
  if (old) cancelAnimationFrame(old.raf);
  const J: Job = {
    u: unfold ? 0 : 1,
    u0: unfold ? 0 : 1,
    target: unfold ? 1 : 0,
    t0: performance.now(),
    done: false,
    raf: 0,
    onFolded,
  };
  jobs.set(pid, J);
  // LaneList redraws on resize; the fold draws over it in the same frame.
  const ro = new ResizeObserver(() => {
    if (!J.done) frame(J.u);
  });
  ro.observe(list);
  const step = (now: number) => {
    const span = treeStepSpan(D, J.target, J.u0);
    const k = F.ink(clamp((now - J.t0) / span));
    J.u = lerp(J.u0, J.target, k);
    frame(J.u);
    if (k < 1) {
      J.raf = requestAnimationFrame(step);
      return;
    }
    J.done = true;
    ro.disconnect();
    for (const c of g.ks) {
      c.el.style.clipPath = '';
      const l = c.el.querySelector<HTMLElement>('.lift');
      if (l) {
        l.style.opacity = '';
        l.style.transform = '';
        l.style.filter = '';
      }
    }
    for (const e of after) e.style.transform = '';
    if (J.target === 0) J.onFolded();
    redrawLists(list);
  };
  // The first frame is the starting pose, now.
  frame(J.u);
  J.raf = requestAnimationFrame(step);
}
