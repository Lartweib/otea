// The four curves of the motion system (MOTION §2.2, mock:1026-1034). Three critically damped
// springs and a pen. JS drives frames with F; WAAPI and CSS take the same curves as linear()
// strings (C here, --o-* in tokens.css: a test keeps them equal character for character).

export type Curve = 'settle' | 'glide' | 'drift' | 'ink';

export const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sstep = (t: number): number => t * t * (3 - 2 * t);

// Critically damped from rest; v is the initial velocity in units of the spring's rate.
export function springFn(K: number, v: number): (t: number) => number {
  const f = (t: number) => 1 - (1 + (1 - v) * K * t) * Math.exp(-K * t);
  const e = f(1);
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : f(t) / e);
}

// The pen: it starts a little slow, runs at an even speed, and lifts off softly.
export function inkFn(): (t: number) => number {
  const N = 1200;
  const cum = [0];
  let prev = 0.55;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const v =
      t < 0.14
        ? 0.55 + 0.45 * Math.sin(((t / 0.14) * Math.PI) / 2)
        : t < 0.54
          ? 1
          : (1 - (t - 0.54) / 0.46) ** 2;
    cum.push((cum[i - 1] ?? 0) + (v + prev) / 2);
    prev = v;
  }
  const total = cum[N] ?? 1;
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (cum[Math.round(t * N)] ?? 0) / total);
}

export const F: Record<Curve, (t: number) => number> = {
  settle: springFn(8, 0),
  glide: springFn(7, 0.5),
  drift: springFn(5, 0.35),
  ink: inkFn(),
};

// A curve sampled into CSS linear(): denser near the start, where the springs move most. Stops
// carry four decimals of percent, as the mock's tokens do (its own sampler wrote three).
export function linearOf(fn: (t: number) => number, n = 34): string {
  const p: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) ** 1.6;
    p.push(i === 0 ? '0' : i === n ? '1' : `${+fn(t).toFixed(4)} ${+(t * 100).toFixed(4)}%`);
  }
  return `linear(${p.join(', ')})`;
}

// The pen as the stylesheet draws it (mock:15, verbatim). F.ink samples to within 0.0006 of it at
// every stop; the mock's tokens were written from a finer pen than its own sampler, so the string is
// kept as written rather than rebuilt.
const INK =
  'linear(0, 0.0029 0.3545%, 0.0093 1.0747%, 0.0184 2.056%, 0.0306 3.2578%, 0.0461 4.6557%, 0.0651 6.2327%, 0.0878 7.9761%, 0.1141 9.8759%, 0.1438 11.924%, 0.1765 14.1135%, 0.2112 16.4385%, 0.2478 18.894%, 0.2862 21.4755%, 0.3264 24.179%, 0.3686 27.001%, 0.4126 29.9382%, 0.4581 32.9877%, 0.5051 36.1468%, 0.5539 39.413%, 0.6039 42.784%, 0.6557 46.2578%, 0.709 49.8322%, 0.7638 53.5055%, 0.8167 57.2759%, 0.8622 61.1417%, 0.9001 65.1015%, 0.931 69.1538%, 0.9553 73.2971%, 0.9733 77.5301%, 0.986 81.8517%, 0.9939 86.2606%, 0.9981 90.7557%, 0.9998 95.3358%, 1)';

// Literal strings for WAAPI, which does not resolve var().
export const C: Record<Curve | 'ease' | 'linear', string> = {
  settle: linearOf(F.settle),
  glide: linearOf(F.glide),
  drift: linearOf(F.drift),
  ink: INK,
  ease: 'cubic-bezier(.25,1,.5,1)',
  linear: 'linear',
};

// The easing string for a curve name, or the string itself when it is already an easing.
export const easing = (curve: string): string => (curve in C ? C[curve as keyof typeof C] : curve);
