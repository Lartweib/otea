import { rowOf } from '../../lanes/dom.ts';
import type { Lane } from '../../lanes/geometry.ts';
import { laneColor } from '../../lanes/looks.ts';
import { C, clamp, F, lerp, sstep } from '../../motion/curves.ts';
import { type Drive, drive } from '../../motion/drive.ts';
import { reduced } from '../../motion/reduced.ts';
import { Tt } from '../../motion/time.ts';
import { penPath } from './frame.ts';

// The pen (SPEC §10.2, mock:2844-2888): the open row's lane reaches across the divider into the
// item, drawn with ink and a spark at its head. It follows the row every frame something moves
// (scroll, the handoff, the fold, the list compacting) and retracts when the row leaves the list.

const NS = 'http://www.w3.org/2000/svg';

type Geom = { d: string; h: Lane; y0: number; len: number };

// While a morph carries the row's node (morph-run.ts), the pen starts from the node on its way, so
// it stays drawn through the morph (sweep #24).
function travellingNode(id: string): DOMRect | null {
  const c = document.querySelector<HTMLElement>(`.stage > .ov > [data-node="${CSS.escape(id)}"]`);
  if (!c || c.style.display === 'none') return null;
  const r = c.getBoundingClientRect();
  return r.width || r.height ? r : null;
}

export class Pen {
  readonly svg: SVGSVGElement;
  private readonly path: SVGPathElement;
  private readonly spark: SVGCircleElement;
  private readonly halo: SVGCircleElement;
  u = 0;
  private y0: number | null = null;
  private run: Drive | null = null;
  private follow = 0;
  private followUntil = 0;
  // While true (Ampliar, the phone, a morph), the pen is not drawn.
  off = false;
  // The row it starts from.
  id: string | null = null;
  // Whether a row was there last time it looked; when the row comes back, it draws again.
  private had = true;

  private readonly main: () => HTMLElement | null;
  private readonly sheet: () => HTMLElement | null;

  constructor(svg: SVGSVGElement, main: () => HTMLElement | null, sheet: () => HTMLElement | null) {
    this.svg = svg;
    this.main = main;
    this.sheet = sheet;
    svg.innerHTML =
      '<path class="lk" fill="none" stroke-width="1" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><circle class="halo" r="7" opacity="0" style="filter:blur(3px)"/><circle class="spark" r="2.2" opacity="0"/>';
    this.path = svg.querySelector('.lk') as SVGPathElement;
    this.halo = svg.querySelector('.halo') as SVGCircleElement;
    this.spark = svg.querySelector('.spark') as SVGCircleElement;
  }

  geom(y0Override?: number | null): Geom | null {
    const main = this.main();
    const sheet = this.sheet();
    if (this.off || !this.id || !main || !sheet) return null;
    const row = rowOf(this.id);
    const head = sheet.querySelector('.headline');
    if (!row || !head) return null;
    const mr = main.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    const sr = sheet.getBoundingClientRect();
    const lw =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--listw')) || 520;
    let x0: number;
    let y0: number;
    if (row.classList.contains('card')) {
      const r = row.getBoundingClientRect();
      x0 = Math.min(r.right - mr.left, lw - 10);
      y0 = r.top - mr.top + 18;
    } else {
      const band = row.querySelector('.band')?.getBoundingClientRect();
      const nd = travellingNode(this.id) ?? row.querySelector('.nd')?.getBoundingClientRect();
      if (!band || !nd) return null;
      x0 = Math.min(band.right - mr.left, lw - 6);
      y0 = nd.top + nd.height / 2 - mr.top;
    }
    if (y0Override != null) y0 = y0Override;
    const xs = Math.round(sr.left - mr.left + 18) + 0.5;
    const xe = sr.left - mr.left + 32;
    const y1 = Math.round(hr.top - mr.top + 20) + 0.5;
    y0 = Math.round(y0) + 0.5;
    const { d, len } = penPath({ x0: Math.round(x0), y0, xs, xe, y1 });
    const h = (row.dataset.h as Lane | undefined) ?? 'ag';
    return { d, h, y0, len };
  }

  draw(y0Override?: number | null): Geom | null {
    const L = this.geom(y0Override ?? this.y0);
    if (!L) {
      this.path.setAttribute('opacity', '0');
      this.spark.setAttribute('opacity', '0');
      this.halo.setAttribute('opacity', '0');
      if (this.had && this.id && !this.off && !rowOf(this.id)) this.had = false;
      return null;
    }
    if (!this.had) {
      // The row came back to the list: the pen draws again from it.
      this.had = true;
      this.u = 0;
      queueMicrotask(() => this.to(1, 0));
    }
    const col = laneColor(L.h);
    this.path.setAttribute('opacity', '1');
    this.path.setAttribute('d', L.d);
    this.path.setAttribute('stroke', col);
    this.spark.setAttribute('fill', col);
    this.halo.setAttribute('fill', col);
    this.path.style.strokeDashoffset = String(1 - this.u);
    return L;
  }

  // Draw (1) or retract (0) with ink over Tt.line(len), the spark riding its head.
  to(target: 0 | 1, delay = 0, T?: number): void {
    this.run?.cancel();
    const L = this.draw();
    if (!L) {
      this.u = target;
      return;
    }
    if (reduced()) {
      this.u = target;
      this.path.style.strokeDashoffset = String(1 - target);
      this.path.animate([{ opacity: target ? 0 : 1 }, { opacity: target ? 1 : 0 }], {
        duration: 160,
        easing: C.drift,
      });
      return;
    }
    const u0 = this.u;
    const dur = (T ?? Tt.line(L.len)) * clamp(Math.abs(target - u0), 0.45, 1);
    this.run = drive(
      dur,
      (k, t) => {
        this.u = lerp(u0, target, F.ink(k));
        if (!this.draw()) return;
        const len = this.path.getTotalLength();
        const pt = this.path.getPointAtLength(len * this.u);
        const a =
          sstep(clamp(this.u / 0.1)) *
          (1 - sstep(clamp((t / dur - 0.72) / 0.28))) *
          (this.u > 0.002 ? 1 : 0);
        for (const e of [this.spark, this.halo]) {
          e.setAttribute('cx', String(pt.x));
          e.setAttribute('cy', String(pt.y));
        }
        this.spark.setAttribute('opacity', a.toFixed(3));
        this.halo.setAttribute('opacity', (0.45 * a).toFixed(3));
      },
      delay,
    );
  }

  // The selection moved to another row: the pen's start glides there, the spark riding mid-way.
  glide(y0Old: number | null): void {
    const g1 = this.geom(null);
    if (!g1 || y0Old == null || this.u < 0.5 || reduced()) {
      this.u = 0;
      this.to(1, 60);
      return;
    }
    this.run?.cancel();
    const T = Tt.travel(g1.y0 - y0Old);
    this.run = drive(T, (k) => {
      const g = this.geom(null);
      if (!g) return;
      this.y0 = lerp(y0Old, g.y0, F.settle(k));
      this.draw();
      const b = Math.sin(Math.PI * k);
      const pt = this.path.getPointAtLength(0.5);
      for (const e of [this.spark, this.halo]) {
        e.setAttribute('cx', String(pt.x));
        e.setAttribute('cy', String(pt.y));
      }
      this.spark.setAttribute('opacity', (0.9 * b).toFixed(3));
      this.halo.setAttribute('opacity', (0.4 * b).toFixed(3));
      if (k >= 1) this.y0 = null;
    });
  }

  // Redraw every frame for a while: something is moving the row.
  followFor(ms = 900): void {
    this.followUntil = Math.max(this.followUntil, performance.now() + ms);
    if (this.follow) return;
    const tick = () => {
      this.draw();
      if (performance.now() < this.followUntil) this.follow = requestAnimationFrame(tick);
      else this.follow = 0;
    };
    this.follow = requestAnimationFrame(tick);
  }

  y0Now(): number | null {
    return this.geom(null)?.y0 ?? null;
  }

  stop(): void {
    this.run?.cancel();
    cancelAnimationFrame(this.follow);
    this.follow = 0;
  }
}

export function makePenSvg(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'link');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
