import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { breathe } from '../../lanes/breathe.ts';
import type { Lane } from '../../lanes/geometry.ts';
import { type Look, laneColor, lookGlyph } from '../../lanes/looks.ts';
import { C, clamp, F, lerp, sstep } from '../../motion/curves.ts';
import { drive } from '../../motion/drive.ts';
import { reduced } from '../../motion/reduced.ts';
import { Tt } from '../../motion/time.ts';
import {
  type DipSpec,
  dipsOf,
  futureD,
  labelsShown,
  laneD,
  type RouteGeom,
  type RouteStep,
  RY,
  routeGeom,
  trunkD,
  walkedD,
} from './route.ts';

// The route (SPEC §10.3, mock:2613-2667): the two lanes laid flat, the walked line through the
// steps the item reached, the future dashed, the node, a dip under your lane for each round you
// sent back. It fits its width; when the item moves, its node rides the walked line (mock:3182-3216).

export type RouteProps = {
  id: string;
  steps: RouteStep[];
  words: string[];
  ci: number;
  lane: Lane;
  look: Look;
  dips: DipSpec[];
  phone?: boolean;
};

const NS = 'http://www.w3.org/2000/svg';

const nodeMarkup = (look: Look): string =>
  look === 'yours'
    ? '<circle r="11" fill="var(--you)" style="filter:blur(3px);opacity:var(--glow-node)"/><circle r="5.5" fill="var(--you)"/>'
    : lookGlyph(look, 'sheet');

function svgEl(markup: string): SVGElement {
  const g = document.createElementNS(NS, 'g');
  g.innerHTML = markup;
  return g.firstElementChild as SVGElement;
}

// The node rides the walked line from its old step to its new one, the walked line inking in
// behind it (or the old one wiping back), then a short breath along its lane.
function ride(
  svg: SVGSVGElement,
  gA: RouteGeom,
  lookA: Look,
  gB: RouteGeom,
  lookB: Look,
  lane: Lane,
) {
  const rn = svg.querySelector<SVGGElement>('.rnode');
  const walked = svg.querySelector<SVGPathElement>('.walked');
  if (!rn || !walked) return;
  rn.style.opacity = '0';
  const longer = gB.pts.length >= gA.pts.length ? gB : gA;
  const path = svgEl(`<path d="${walkedD(longer)}" fill="none"/>`) as SVGPathElement;
  svg.appendChild(path);
  const L = path.getTotalLength();
  const near = (pt: [number, number]) => {
    let best = 0;
    let bd = 1e9;
    for (let s = 0; s <= L; s += 2) {
      const q = path.getPointAtLength(s);
      const d = (q.x - pt[0]) ** 2 + (q.y - pt[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  const la = near(gA.node);
  const lb = near(gB.node);
  const Lw = walked.getTotalLength();
  walked.removeAttribute('pathLength');
  const trav = svgEl(
    `<g><g class="la">${nodeMarkup(lookA)}</g><g class="lb">${nodeMarkup(lookB)}</g></g>`,
  ) as SVGGElement;
  svg.appendChild(trav);
  const ga = trav.querySelector('.la') as SVGGElement;
  const gb = trav.querySelector('.lb') as SVGGElement;
  const T = Tt.travel(lb - la);
  const fwd = lb >= la;
  let old: SVGPathElement | null = null;
  if (!fwd) {
    old = svgEl(
      `<path d="${walkedD(gA)}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"/>`,
    ) as SVGPathElement;
    svg.insertBefore(old, walked);
    walked.style.opacity = '0';
  }
  drive(T, (k) => {
    const p2 = F.settle(k);
    const s = lerp(la, lb, p2);
    const pt = path.getPointAtLength(s);
    trav.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
    const o = sstep(clamp((p2 - 0.3) / 0.4));
    ga.setAttribute('opacity', String(1 - o));
    gb.setAttribute('opacity', String(o));
    if (fwd) walked.style.strokeDasharray = `${Math.min(Lw, s + 0.5)} ${Lw + 10}`;
    else if (old) old.style.strokeDasharray = `${s} ${L + 10}`;
    if (k >= 1) {
      trav.remove();
      path.remove();
      old?.remove();
      rn.style.opacity = '';
      walked.style.strokeDasharray = '';
      walked.style.opacity = '';
      breathe(svg, RY[lane], gB.node[0], laneColor(lane), gB.W, 60, 0.6, true);
    }
  });
  return T;
}

export function Route({ id, steps, words, ci, lane, look, dips, phone = false }: RouteProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // The phone fits the route to its width (the names give way); the desk keeps 420 at least.
    const min = phone ? 0 : 420;
    const measure = () => setW(Math.max(min, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone]);

  const g = W > 0 && steps.length > 0 ? routeGeom(steps, ci, lane, W) : null;
  const was = useRef<{ id: string; g: RouteGeom; look: Look; dips: number } | null>(null);
  useLayoutEffect(() => {
    if (!g || !svg.current) return;
    const asked = wrap.current && pendingDraw.get(wrap.current);
    if (asked && wrap.current)
      drawRoute(wrap.current, Math.max(0, asked.delay - (performance.now() - asked.at)));
    const before = was.current;
    was.current = { id, g, look, dips: dips.length };
    if (!before || before.id !== id || before.g.W !== g.W || reduced()) return;
    const moved = before.g.ci !== g.ci || before.g.node[1] !== g.node[1] || before.look !== look;
    if (!moved) return;
    const T = ride(svg.current, before.g, before.look, g, look, lane) ?? 560;
    if (dips.length > before.dips) {
      const all = svg.current.querySelectorAll<SVGPathElement>('.dip');
      const nd = all[all.length - 1];
      if (nd) {
        nd.style.strokeDasharray = '1';
        nd.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
          duration: 520,
          delay: T * 0.6,
          easing: C.ink,
          fill: 'backwards',
        });
      }
      const labs = svg.current.querySelectorAll('.dips text');
      labs[labs.length - 1]?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        delay: T * 0.6 + 520,
        easing: C.drift,
        fill: 'backwards',
      });
    }
  });

  if (!g) return <div className="route-wrap" data-c ref={wrap} />;
  const small = W < 600;
  const named = labelsShown(
    g.xs,
    steps.map((s, i) => (words[i] ?? s.name).toLocaleUpperCase()),
    g.ci,
    small ? 6.6 : 7.9,
  );
  const future = futureD(g);
  return (
    <div className="route-wrap" data-c ref={wrap}>
      <svg
        ref={svg}
        className="route"
        width={W}
        height={104}
        viewBox={`0 0 ${W} 104`}
        role="img"
        aria-label={t('sheet.route.aria', { id })}
      >
        <g className="rfx" />
        <g className={small ? 'rlab small' : 'rlab'}>
          {steps.map((s, i) =>
            !named[i] ? null : (
              <text
                key={s.name}
                x={g.xs[i]}
                y={9}
                textAnchor={i === g.n - 1 && g.n > 1 ? 'end' : i === 0 ? 'start' : 'middle'}
                className={i === g.ci && lane === 'you' ? 'cur' : undefined}
                dx={i === 0 ? -((g.xs[0] ?? 44) - 24) : undefined}
              >
                {(words[i] ?? s.name).toLocaleUpperCase()}
              </text>
            ),
          )}
        </g>
        <g className="rnames">
          <text x={0} y={36.5}>
            {t('lanes.agents')}
          </text>
          <text x={0} y={68.5} className="you">
            {t('lanes.you')}
          </text>
        </g>
        <path
          className="rl"
          pathLength={1}
          d={laneD(g.xh, RY.ag)}
          fill="none"
          stroke="var(--lane)"
          strokeWidth={1}
          opacity={0.55}
        />
        <path
          className="rl"
          pathLength={1}
          d={laneD(g.xh, RY.you)}
          fill="none"
          stroke="var(--you)"
          strokeWidth={1}
          opacity={0.4}
        />
        <path
          className="rl"
          pathLength={1}
          d={trunkD(g.xh, W)}
          fill="none"
          stroke="var(--closed)"
          strokeWidth={1}
          opacity={0.6}
        />
        <g className="dips">
          {dipsOf(g, dips).map((dp) => (
            <g key={dp.x}>
              <path
                className="dip"
                pathLength={1}
                d={dp.d}
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth={1}
              />
              <circle cx={dp.x} cy={79.6} r={2} fill="var(--ink-3)" />
              {dp.label ? (
                <text x={dp.x} y={99} textAnchor="middle">
                  {dp.label}
                </text>
              ) : null}
            </g>
          ))}
        </g>
        <path
          className="rl walked"
          pathLength={1}
          d={walkedD(g)}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {future ? (
          <>
            <path
              className="future"
              d={future}
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth={1.25}
              strokeDasharray="1.5 4"
              strokeLinecap="round"
            />
            <circle
              className="future"
              cx={g.xh}
              cy={RY.none}
              r={3.6}
              fill="var(--sheet)"
              stroke="var(--closed)"
              strokeWidth={1.25}
            />
          </>
        ) : null}
        <g className="stops" fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.25}>
          {g.pts.slice(0, -1).map(([x, y]) => (
            <circle key={`${x}:${y}`} cx={x} cy={y} r={3.2} />
          ))}
        </g>
        <g
          className="rnode"
          transform={`translate(${g.node[0]} ${g.node[1]})`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed glyph markup from lanes/looks
          dangerouslySetInnerHTML={{ __html: nodeMarkup(look) }}
        />
      </svg>
    </div>
  );
}

// The route draws in on open: lanes and dips ink, the rest resolves, the node last (mock:2804-2809).
const pendingDraw = new WeakMap<Element, { delay: number; at: number }>();

export function drawRoute(wrap: Element | null, delay = 160): void {
  if (!wrap || reduced()) return;
  // The route measures its width before it draws: a draw asked for before then waits for it, on the
  // same clock.
  if (!wrap.querySelector('svg')) {
    pendingDraw.set(wrap, { delay, at: performance.now() });
    return;
  }
  pendingDraw.delete(wrap);
  wrap.querySelectorAll<SVGPathElement>('.rl, .dip').forEach((l, i) => {
    l.style.strokeDasharray = '1';
    l.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: 640,
      delay: delay + 40 * i,
      easing: C.ink,
      fill: 'backwards',
    }).finished.then(
      () => {
        l.style.strokeDasharray = '';
      },
      () => undefined,
    );
  });
  for (const e of wrap.querySelectorAll(
    '.future, .stops, .rlab, .rnames, .dips text, .dips circle',
  ))
    e.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 420,
      delay: delay + 300,
      easing: C.drift,
      fill: 'backwards',
    });
  wrap.querySelector('.rnode')?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 300,
    delay: delay + 420,
    easing: C.drift,
    fill: 'backwards',
  });
}

// On close the route undraws with the same ink (mock:2985). `mirror` (the phone, where the page
// is the whole gesture) plays drawRoute backwards with the same parts and length: the node goes,
// the names and stops fade, the lines and dips wipe back last drawn first.
export function undrawRoute(wrap: Element | null, mirror = false): void {
  if (!wrap || reduced()) return;
  const lines = [...wrap.querySelectorAll<SVGPathElement>(mirror ? '.rl, .dip' : '.rl')];
  const lead = mirror ? 160 : 0;
  lines.forEach((l, i) => {
    l.style.strokeDasharray = '1';
    l.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }], {
      duration: 640,
      delay: mirror ? 40 * (lines.length - 1 - i) : 0,
      easing: C.ink,
      fill: 'forwards',
    });
  });
  if (!mirror) return;
  wrap.querySelector('.rnode')?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 300,
    easing: C.drift,
    fill: 'forwards',
  });
  for (const e of wrap.querySelectorAll(
    '.future, .stops, .rlab, .rnames, .dips text, .dips circle',
  ))
    e.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 420,
      delay: lead - 120,
      easing: C.drift,
      fill: 'forwards',
    });
}
