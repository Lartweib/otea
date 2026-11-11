// A velocity-preserving, critically damped spring for drags, flicks and retargets (MOTION §5.4):
// it starts at `from` with velocity v0 (units per ms) and lands at `to` at T, at rest. MOTION's
// spring only settles near T; a cubic correction that is zero, with zero slope, at the start takes
// out what is left at T, so the landing is exact and position and velocity stay continuous.
export function spring(
  from: number,
  to: number,
  v0: number,
  T: number,
): (t: number) => { x: number; v: number } {
  const w = 8 / T;
  const c1 = from - to;
  const c2 = v0 + w * c1;
  const r = (t: number) => (c1 + c2 * t) * Math.exp(-w * t);
  const dr = (t: number) => (c2 - w * (c1 + c2 * t)) * Math.exp(-w * t);
  const rT = r(T);
  const mT = dr(T) * T;
  return (t) => {
    if (t >= T) return { x: to, v: 0 };
    const u = Math.max(0, t) / T;
    const h = rT * (3 * u * u - 2 * u ** 3) + mT * (u ** 3 - u * u);
    const dh = (rT * (6 * u - 6 * u * u) + mT * (3 * u * u - 2 * u)) / T;
    return { x: to + r(t) - h, v: dr(t) - dh };
  };
}
