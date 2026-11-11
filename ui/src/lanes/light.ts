import type { LaneParams } from './geometry.ts';

// The lane light (SPEC §4.4, Instrument's litSegment, mock:1863-1882): drawn into the list's
// <g class="glow">, which lies above the lines, so the light sits on the lane, never under it.
//   your nodes: a 60 px stretch of the lane in blue (a 4 px blurred stroke under a 1.5 px core) and
//               a soft halo, breathing slowly, offset node to node;
//   working agent nodes: 30 px each way of --lane-lit, with a small halo;
//   stuck nodes: 22 px each way in --warn, with a small halo.

// While on, drawLight keeps its last drawing (unless told keepHalos): the light rests while rows
// find new heights (the detail opening, a handoff).
export const GLOW_HOLD = { on: false };

const drawn = new WeakMap<Element, string>();

function setHTML(el: Element | null, html: string): void {
  if (!el || drawn.get(el) === html) return;
  el.innerHTML = html;
  drawn.set(el, html);
}

const yours = (y: number, i: number) =>
  `<g class="gl" transform="translate(40.5 ${y})" style="animation-delay:${(-i * 0.9).toFixed(1)}s"><rect x="-2" y="-30" width="4" height="60" fill="url(#gB)" style="filter:blur(2.4px);opacity:var(--glow-lit)"/><rect x="-.75" y="-30" width="1.5" height="60" fill="url(#gB)"/><circle r="13" fill="var(--you)" opacity=".3" style="filter:blur(6px)"/><circle r="7.5" fill="var(--you)" opacity=".5" style="filter:blur(2.5px)"/></g>`;

const lit = (x: number, y: number, half: number, grad: string, col: string) =>
  `<g class="lt" transform="translate(${x} ${y})"><rect x="-2" y="${-half}" width="4" height="${2 * half}" fill="url(#${grad})" style="filter:blur(2.4px);opacity:var(--glow-lit)"/><rect x="-.75" y="${-half}" width="1.5" height="${2 * half}" fill="url(#${grad})"/><circle r="10" fill="${col}" opacity=".26" style="filter:blur(4.5px)"/><circle r="6.5" fill="${col}" opacity=".32" style="filter:blur(2px)"/></g>`;

// The markup of each group, for the params given (pure: what drawLight writes).
export function lightMarkup(p: LaneParams): { halos: string; ags: string; warms: string } {
  return {
    halos: p.atasco ? '' : p.ys.map((y, i) => yours(y, i)).join(''),
    warms: p.ws.map((y) => lit(16.5, y, 22, 'gR', 'var(--warn)')).join(''),
    ags: p.atasco ? '' : p.as.map((y) => lit(16.5, y, 30, 'gL', 'var(--lane-lit)')).join(''),
  };
}

export function drawLight(
  svg: SVGSVGElement,
  p: LaneParams,
  opts: { keepHalos?: boolean } = {},
): void {
  const g = svg.querySelector('.glow');
  if (!g) return;
  const built = !!g.querySelector(':scope > .halos');
  if (GLOW_HOLD.on && built && !opts.keepHalos) return;
  if (!built) g.innerHTML = '<g class="ags"></g><g class="halos"></g><g class="warms"></g>';
  const m = lightMarkup(p);
  if (!opts.keepHalos) setHTML(g.querySelector('.halos'), m.halos);
  setHTML(g.querySelector('.warms'), m.warms);
  setHTML(g.querySelector('.ags'), m.ags);
}
