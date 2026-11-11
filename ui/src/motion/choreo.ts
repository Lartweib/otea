import { C, type Curve, clamp } from './curves.ts';
import { wait } from './drive.ts';
import { reduced } from './reduced.ts';

// A gesture made of parts that closes mirrored in space and reverses from where it is
// (mock:1050-1080, MOTION §5.1). Opening runs each part from `from` to `to` after d0; closing runs
// the same parts back, each after d1 = D - d0 - T, so the last part to open is the first to close.

export type Part = {
  el: Element | null | undefined;
  from: Keyframe;
  to: Keyframe;
  T: number;
  curve: Curve;
  d0: number;
  d1?: number;
  // Exists only under reduced motion (it holds the element at `to` in full motion).
  ronly?: boolean;
};

type Running = Part & {
  el: Element;
  anim?: Animation;
  start?: number;
  delay?: number;
  dur?: number;
};

export const part = (
  el: Element | null | undefined,
  from: Keyframe,
  to: Keyframe,
  T: number,
  curve: Curve,
  d0 = 0,
  extra: Partial<Pick<Part, 'd1' | 'ronly'>> = {},
): Part => ({ el, from, to, T, curve, d0, ...extra });

// The close delays that mirror the open, and the gesture's length.
export function mirrorDelays(parts: Part[]): number {
  const D = Math.max(1, ...parts.map((p) => p.d0 + p.T));
  for (const p of parts) if (p.d1 == null) p.d1 = D - p.d0 - p.T;
  return D;
}

function computed(el: Element, target: Keyframe): Keyframe {
  const cs = getComputedStyle(el) as unknown as Record<string, string>;
  const cur: Keyframe = {};
  for (const k of Object.keys(target)) cur[k] = cs[k] ?? '';
  return cur;
}

export class Choreo {
  dir: 0 | 1 = 0;
  private readonly parts: Running[];
  private D: number;
  private t0: number | null = null;
  private gen = 0;

  constructor(parts: Part[]) {
    this.parts = parts.filter((p): p is Running => !!p.el);
    this.D = mirrorDelays(this.parts);
  }

  // Resolves true when this call is still the latest one as it ends.
  go(dir: 0 | 1): Promise<boolean> {
    const now = performance.now();
    const R = reduced();
    const running = this.t0 != null && now - this.t0 < this.D;
    const prog = running && this.t0 != null ? clamp((now - this.t0) / this.D) : 1;
    let end = 0;
    for (const p of this.parts) {
      const target = dir ? p.to : p.from;
      let cur: Keyframe;
      let pp = 1;
      if (p.anim) {
        cur = computed(p.el, target);
        pp = clamp((now - (p.start ?? now) - (p.delay ?? 0)) / (p.dur || 1));
        p.anim.cancel();
      } else cur = dir ? p.from : p.to;
      const isOp = Object.keys(target).every((k) => k === 'opacity');
      let kf: Keyframe[] = [cur, target];
      let T: number;
      let delay: number;
      if (R) {
        T = isOp ? 160 : 1;
        delay = 0;
        if (!isOp) kf = [target, target];
      } else {
        T = p.T * (running ? clamp(pp, 0.45, 1) : 1);
        delay = (dir ? p.d0 : (p.d1 ?? 0)) * prog;
        if (p.ronly) kf = [p.to, p.to];
      }
      p.anim = p.el.animate(kf, {
        duration: T,
        delay,
        easing: R ? C.drift : C[p.curve],
        fill: 'both',
      });
      p.start = now;
      p.delay = delay;
      p.dur = T;
      end = Math.max(end, delay + T);
    }
    this.dir = dir;
    this.t0 = now;
    this.D = end || this.D;
    const gen = ++this.gen;
    return wait(end + 20).then(() => gen === this.gen);
  }

  cancel(): void {
    for (const p of this.parts) p.anim?.cancel();
  }
}
