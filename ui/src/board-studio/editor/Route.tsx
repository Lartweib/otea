import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { DONE } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { lookGlyph } from '../../lanes/looks.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { cardKey, cardOf, useEditor } from './context.ts';
import { addStep } from './edits.ts';
import { Glyph } from './glyphs.tsx';
import {
  backLoop,
  type Geom,
  geom,
  labelSpot,
  lanePaths,
  pathOf,
  plusSpots,
  pointsOf,
  RY,
  type Stop,
  wayArcs,
} from './route-geometry.ts';
import { whoWord } from './who.ts';

// The board laid flat on the two lanes (mock 60-route.js routeSvg, 70-views.js fitCanvas): each step
// a node on the lane of whoever does it, a review by you a visit to your lane with a halo, the other
// ways dashed arcs over the agents' lane, the selected step's send-back a loop under yours. A + sits
// between stops on hover. Nodes slide to their new places when steps come, go or move.

const H = 126;
const TOP = 40;

function halo(x: number, y: number, i: number) {
  return (
    <g
      key={`h${x}:${y}`}
      className="gl"
      transform={`translate(${x} ${y})`}
      style={{ animationDelay: `${(-i * 0.9).toFixed(1)}s` }}
    >
      <circle r="13" style={{ filter: 'blur(6px)' }} />
      <circle r="7.5" style={{ filter: 'blur(2.5px)' }} />
    </g>
  );
}

// The light on the selected stop's lane: a stretch of current, brightest at the node.
function lit(x: number, y: number, you: boolean) {
  const grad = you ? 'url(#se-gBh)' : 'url(#se-gLh)';
  const col = you ? 'var(--you)' : 'var(--lane-lit)';
  return (
    <g className="se-lit" transform={`translate(${x} ${y})`}>
      <rect
        y="-2"
        x="-46"
        height="4"
        width="92"
        fill={grad}
        style={{ filter: 'blur(2.4px)', opacity: 'var(--glow-lit)' }}
      />
      <rect y="-.75" x="-46" height="1.5" width="92" fill={grad} />
      <circle r="10" fill={col} opacity=".26" style={{ filter: 'blur(4.5px)' }} />
      <circle r="6.5" fill={col} opacity=".32" style={{ filter: 'blur(2px)' }} />
    </g>
  );
}

function StopNode({ st, on }: { st: Stop; on: boolean }) {
  let mark = null;
  if (st.kind === 'form')
    mark = (
      <circle
        r="5"
        fill="var(--sheet)"
        stroke="var(--ink-2)"
        strokeWidth="1.25"
        strokeDasharray="2.6 2.2"
      />
    );
  else if (st.kind === 'done')
    // biome-ignore lint/security/noDangerouslySetInnerHtml: the fixed glyph of Hecho
    mark = <g dangerouslySetInnerHTML={{ __html: lookGlyph('done') }} />;
  else if (st.y === RY.you)
    mark = (
      <>
        <circle r="6" fill="var(--ground)" />
        <circle r="5" fill="var(--you)" />
      </>
    );
  else
    mark = (
      <>
        <circle r="6" fill="var(--ground)" />
        <circle r="4.6" fill="var(--ground)" stroke="var(--ink)" strokeWidth="1.35" />
      </>
    );
  return (
    <g className="se-stop" data-key={st.key} transform={`translate(${st.x} ${st.y})`}>
      {on ? <circle r="12" fill="none" stroke="var(--ink)" strokeWidth="1.25" /> : null}
      {mark}
    </g>
  );
}

function stopName(st: Stop, item: string): string {
  if (st.kind === 'form') return t('bs.editor.route.create', { item });
  if (st.kind === 'done') return t('bs.done');
  return st.step.name.trim() || t('bs.editor.route.unnamed');
}

function stopSub(st: Stop): string {
  if (st.kind === 'form') return t('bs.editor.route.asks');
  if (st.kind === 'done') return t('bs.editor.route.ends');
  const doer = whoWord(st.step.doer);
  if (st.step.reviewer === 'none') return doer;
  return t('bs.editor.route.sub_review', { doer, reviewer: whoWord(st.step.reviewer) });
}

export function Route() {
  const { draft, setOpenRow } = useEditor();
  const def = draft.def;
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setW(Math.max(520, Math.round(el.offsetWidth || 900)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g: Geom = geom(def, W);
  const sel = cardOf(def, draft.selection);
  const selKey = cardKey(sel);
  const selStop = g.stops.find((s) => s.key === selKey);
  const lanes = lanePaths(g);
  const arcs = wayArcs(def, g);
  const loop = sel.kind === 'step' ? backLoop(g, sel.id) : null;

  const select = (key: string) => {
    setOpenRow(null);
    draft.endBurst();
    if (key === 'form' || key === 'done') draft.select({ kind: key });
    else draft.select({ kind: 'step', id: key });
  };
  const add = (at: number) => {
    let id = '';
    draft.mutate((d) => {
      id = addStep(d, at, t('bs.editor.newstep'));
    });
    if (id) {
      setOpenRow(null);
      draft.select({ kind: 'step', id });
      window.setTimeout(() => {
        const name = document.querySelector<HTMLInputElement>('.se-card input.se-stepname');
        name?.focus({ preventScroll: true });
        name?.select();
      }, 260);
    }
  };

  // What moved slides from where it was; what is new grows in on its lane.
  const last = useRef<{
    W: number;
    pos: Map<string, [number, number]>;
    labs: Map<string, number>;
  } | null>(null);
  const drawn = useRef(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const pos = new Map<string, [number, number]>();
    for (const s of g.stops) {
      pos.set(s.key, [s.x, s.y]);
      if (s.rv) pos.set(`${s.key}~rv`, [s.rv.x, s.rv.y]);
    }
    const labs = new Map(
      [...el.querySelectorAll<HTMLElement>('.se-stoplab')].map((e) => [
        e.dataset.key ?? '',
        e.offsetLeft,
      ]),
    );
    const prev = last.current;
    last.current = { W, pos, labs };
    if (reduced()) return;
    if (!drawn.current) {
      drawn.current = true;
      for (const line of el.querySelectorAll<SVGPathElement>('[data-ink]'))
        line.animate(
          [
            { strokeDasharray: '1 1', strokeDashoffset: 1 },
            { strokeDasharray: '1 1', strokeDashoffset: 0 },
          ],
          {
            duration: 900,
            easing: C.ink,
          },
        );
      return;
    }
    // A new width lays everything out again: no slide.
    if (!prev || prev.W !== W) return;
    for (const node of el.querySelectorAll<SVGGElement>('g[data-key]')) {
      const key = node.dataset.key ?? '';
      const now = pos.get(key);
      if (!now) continue;
      const [tx, ty] = now;
      const was = prev.pos.get(key);
      if (was) {
        const dx = was[0] - now[0];
        const dy = was[1] - now[1];
        if (Math.abs(dx) + Math.abs(dy) > 0.5)
          node.animate(
            [
              { transform: `translate(${tx + dx}px, ${ty + dy}px)` },
              { transform: `translate(${tx}px, ${ty}px)` },
            ],
            { duration: 560, easing: C.settle },
          );
      } else
        node.animate(
          [
            { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(0.2)` },
            { opacity: 1, transform: `translate(${tx}px, ${ty}px) scale(1)` },
          ],
          { duration: 520, delay: 200, easing: C.settle, fill: 'backwards' },
        );
    }
    for (const lab of el.querySelectorAll<HTMLElement>('.se-stoplab, .se-stopsub')) {
      const key = lab.dataset.key ?? '';
      const was = prev.labs.get(key);
      if (was === undefined) {
        lab.animate(
          [
            { opacity: 0, filter: 'blur(1px)' },
            { opacity: 1, filter: 'blur(0px)' },
          ],
          {
            duration: 340,
            delay: 320,
            easing: C.drift,
            fill: 'backwards',
          },
        );
        continue;
      }
      const now = labs.get(key);
      const dx = now === undefined ? 0 : was - now;
      if (Math.abs(dx) > 0.5)
        lab.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], {
          duration: 560,
          easing: C.settle,
        });
    }
    if (prev.pos.size !== pos.size) {
      const walked = el.querySelector<SVGPathElement>('path.se-walked');
      walked?.animate(
        [
          { strokeDasharray: '1 1', strokeDashoffset: 0.35 },
          { strokeDasharray: '1 1', strokeDashoffset: 0 },
        ],
        { duration: 520, easing: C.ink },
      );
    }
  });

  let hi = 0;
  const halos = g.stops.flatMap((st) => {
    if (st.kind !== 'step') return [];
    const out = [];
    if (st.y === RY.you) out.push(halo(st.x, st.y, hi++));
    if (st.rv?.you && !st.rv.same) out.push(halo(st.rv.x, st.rv.y, hi++));
    return out;
  });

  return (
    <div className="se-rwrap" ref={wrap}>
      <div className="se-rstage" style={{ height: H + TOP, paddingTop: TOP }}>
        <svg
          className="se-route"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t('bs.editor.route.label', { board: def.name })}
        >
          <defs>
            <linearGradient id="se-gBh" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--you)', stopOpacity: 0 }} />
              <stop
                offset=".5"
                style={{ stopColor: 'color-mix(in oklch, var(--you) 55%, white)', stopOpacity: 1 }}
              />
              <stop offset="1" style={{ stopColor: 'var(--you)', stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id="se-gLh" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--lane-lit)', stopOpacity: 0 }} />
              <stop offset=".5" style={{ stopColor: 'var(--lane-lit)', stopOpacity: 1 }} />
              <stop offset="1" style={{ stopColor: 'var(--lane-lit)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <g className="se-lanelab">
            <text x="0" y={RY.ag + 3.5}>
              {t('bs.editor.lane.ag')}
            </text>
            <text x="0" y={RY.you + 3.5} className="you">
              {t('bs.editor.lane.you')}
            </text>
          </g>
          <path
            data-ink=""
            pathLength={1}
            d={lanes.ag}
            fill="none"
            stroke="var(--lane)"
            strokeWidth="1"
            opacity=".55"
          />
          <path
            data-ink=""
            pathLength={1}
            d={lanes.you}
            fill="none"
            stroke="var(--you)"
            strokeWidth="1"
            opacity=".4"
          />
          <path
            data-ink=""
            pathLength={1}
            d={lanes.trunk}
            fill="none"
            stroke="var(--closed)"
            strokeWidth="1"
            opacity=".6"
          />
          <g className="glow">
            <g className="halos">{halos}</g>
            {selStop?.kind === 'step' ? lit(selStop.x, selStop.y, selStop.y === RY.you) : null}
          </g>
          <g className="se-ways">
            {arcs.map((a) => (
              <g key={`${a.from}>${a.to}`}>
                <path
                  d={a.d}
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeWidth="1"
                  strokeDasharray="2 3.5"
                  strokeLinecap="round"
                />
                <text x={a.label.x} y={a.label.y} textAnchor="middle" className="se-or">
                  {t('bs.editor.route.or')}
                </text>
              </g>
            ))}
          </g>
          {loop ? (
            <g className="se-loop">
              <path
                d={loop.d}
                fill="none"
                stroke="var(--you)"
                strokeWidth="1"
                strokeDasharray="2 3.5"
                strokeLinecap="round"
                opacity=".7"
              />
              <text x={loop.label.x} y={loop.label.y} textAnchor="middle">
                {t('bs.editor.route.loop')}
              </text>
            </g>
          ) : null}
          <path
            className="se-walked"
            data-ink=""
            pathLength={1}
            d={pathOf(pointsOf(g))}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.25"
            strokeLinejoin="round"
            opacity=".85"
          />
          <g className="se-nodes">
            {g.stops.map((st) => (
              <StopNode key={st.key} st={st} on={st.key === selKey} />
            ))}
            {g.stops.map((st) =>
              st.rv ? (
                <g
                  key={`rv${st.key}`}
                  className="se-stop se-rv"
                  data-key={`${st.key}~rv`}
                  transform={`translate(${st.rv.x} ${st.rv.y})`}
                >
                  {st.rv.you ? (
                    <circle r="3.6" fill="var(--you)" />
                  ) : (
                    <circle r="3.4" fill="var(--ground)" stroke="var(--ink-2)" strokeWidth="1.25" />
                  )}
                </g>
              ) : null,
            )}
          </g>
        </svg>
        {g.stops.map((st, i) => {
          const spot = labelSpot(g, i);
          const name = stopName(st, def.item);
          const you = st.kind === 'step' && st.y === RY.you;
          const cls = ['se-stoplab', spot.pos, you ? 'you' : '', st.key === selKey ? 'on' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <span key={st.key} className="se-stopat">
              <button
                type="button"
                className={cls}
                data-key={st.key}
                style={{ left: spot.x }}
                aria-current={st.key === selKey ? 'true' : undefined}
                onClick={() => select(st.key)}
              >
                {name}
              </button>
              <span
                className={`se-stopsub ${spot.pos}`}
                data-key={st.key}
                style={{ left: spot.x, top: 21 }}
              >
                {stopSub(st)}
              </span>
              <button
                type="button"
                className="se-stopbtn"
                tabIndex={-1}
                aria-hidden="true"
                style={{ left: st.x, top: st.y + TOP } as CSSProperties}
                onClick={() => select(st.key)}
              />
            </span>
          );
        })}
        {plusSpots(g).map((p) => (
          <button
            key={`plus${p.at}`}
            type="button"
            className={def.steps.length === 0 ? 'se-plus show' : 'se-plus'}
            style={{ left: p.x, top: p.y + TOP }}
            aria-label={t('bs.editor.route.add')}
            title={t('bs.editor.route.add')}
            onClick={() => add(p.at)}
          >
            <Glyph name="plus" />
          </button>
        ))}
      </div>
    </div>
  );
}

export { DONE };
