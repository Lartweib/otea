import { C, clamp, F, lerp } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { Tt } from '../../motion/time.ts';
import type { BoardMode } from './model.ts';
import { blurOf, copyOf, glyphOf, landedOn, moveOf } from './morph-clone.ts';
import {
  aFade,
  colFade,
  edgeFrame,
  GLIDE_T,
  type Glide,
  glideFrame,
  glideFrom,
  inkHead,
  morphDelay,
  morphEnds,
  near,
  nodeFrom,
  type Pt,
  plateOpacity,
  rowResolve,
  titleFrame,
  travelFrame,
  whoFrame,
} from './motion-math.ts';

// Pasos ⇄ Lista ⇄ Tabla: one morph where every item keeps its identity (SPEC §10.1, MOTION §3.9,
// a port of mock:2441-2573). Both views are laid out: A (the old one, absolute, `.mghost`) and B
// (the new one, in flow). Per item its shared pieces travel on their own clock (the title as two
// shaped copies, the id, the node or the card's edge gathering into the node, who, when, the card's
// plate becoming the row's band); the ink head draws B's lanes and resolves what only B has; toward
// Pasos the columns trace their rules and the cards resolve. Pressed again mid-way, it turns back
// from where it is. Per-frame writes go straight to the DOM. On a wide screen the views set the
// board column's width: its head, tools and stage glide from where they stood on the same clock.
// Lista ⇄ Tabla is the same row on both sides (sweep #23): each piece travels as one copy, the
// destination's own, from where the old glyphs stood, and the rest of the row comes with it, on
// the row's clock; the node travels on that clock too, so it never leaves its row.

export type MorphJob = {
  from: BoardMode;
  to: BoardMode;
  target: 0 | 1;
  done: boolean;
  reverse(): void;
  finishNow(): void;
  // After a turn back has laid the column out at its old width: glide from where it is now.
  reglide(before: Map<HTMLElement, DOMRect>): void;
};

// Where the column's pieces stand on screen, before a switch changes its width.
export function columnRects(pieces: HTMLElement[]): Map<HTMLElement, DOMRect> {
  return new Map(pieces.map((e) => [e, e.getBoundingClientRect()]));
}

type R = { x: number; y: number; w: number; h: number };
type Swap = { ra: R; rb: R; ca: HTMLElement; cb: HTMLElement };
// One copy on its way from the old glyphs to the new (travelFrame).
type Trip = { c: HTMLElement; from: Pt; to: Pt; o: Pt; s0: number };
type Piece = {
  id: string;
  from: number;
  u?: number;
  T: number;
  d: number;
  tA: HTMLElement;
  tB: HTMLElement;
  rA: R;
  rB: R;
  fA: number;
  fB: number;
  iA?: R;
  iB?: R;
  idc?: HTMLElement;
  who?: Swap;
  when?: Swap;
  nA?: R;
  nB?: R;
  aEdge?: boolean;
  bEdge?: boolean;
  nd?: HTMLElement;
  edge?: HTMLElement;
  cardR?: R;
  bandR?: R;
  plate?: HTMLElement;
  // The side it has landed on and handed back to, if it has.
  landed?: 0 | 1 | null;
  // Lista ⇄ Tabla: its copies' trips, and how far its row has to come.
  trips?: Trip[];
  rowDy?: number;
};

const KEYS = ['t', 'id', 'node', 'edge', 'who', 'when'] as const;

const $$ = <E extends Element = HTMLElement>(sel: string, root: ParentNode) => [
  ...root.querySelectorAll<E>(sel),
];

// Clears what the morph wrote on the side that stays (never React's own style keys).
function settle(keep: HTMLElement) {
  keep.classList.remove('mghost');
  keep.style.width = '';
  keep.style.opacity = '';
  keep.style.filter = '';
  keep.style.visibility = '';
  for (const e of $$<HTMLElement | SVGElement>('[style]', keep)) {
    if (e.closest('svg') && !(e instanceof SVGSVGElement)) continue;
    e.style.opacity = '';
    e.style.filter = '';
    e.style.visibility = '';
    if (!e.matches('.nd')) e.style.transform = '';
    if (e.matches('.card')) {
      e.style.backgroundColor = '';
      e.style.borderColor = '';
    }
  }
  for (const g of $$<SVGGElement>('svg.ink > .glow, svg.ink > .branch', keep)) g.style.opacity = '';
  for (const p of $$<SVGPathElement>('.lines .ln', keep)) {
    p.style.strokeDashoffset = '';
    p.style.strokeDasharray = '';
    p.removeAttribute('pathLength');
  }
}

export function morph(
  stage: HTMLElement,
  A: HTMLElement,
  B: HTMLElement,
  from: BoardMode,
  to: BoardMode,
  onFinish: (side: 0 | 1) => void,
  // A's width as it stood in flow, measured before it turned absolute.
  aWidth = A.offsetWidth,
  // Where the column's pieces (columnRects) stood before the switch laid them out anew.
  before?: Map<HTMLElement, DOMRect>,
): MorphJob {
  const job: MorphJob = {
    from,
    to,
    target: 1,
    done: false,
    reverse: () => undefined,
    finishNow: () => undefined,
    reglide: () => undefined,
  };
  A.style.width = `${aWidth}px`;
  let ov: HTMLElement | null = null;
  let under: HTMLElement | null = null;
  let raf = 0;
  // The column's glide: each piece from where it stood to where it is laid out, on the morph's clock.
  let glides: { e: HTMLElement; g: Glide }[] = [];
  let g0 = 0;
  const aim = (from: Map<HTMLElement, DOMRect> | undefined) => {
    for (const { e } of glides) e.style.transform = '';
    glides = [];
    g0 = performance.now();
    if (!from || reduced()) return;
    for (const e of from.keys()) e.style.transform = '';
    for (const [e, a] of from) {
      if (!e.isConnected) continue;
      const b = e.getBoundingClientRect();
      if (!(a.width || a.height) || !(b.width || b.height)) continue;
      const g = glideFrom(a, b, e.dataset.leaf === 'w');
      if (g) glides.push({ e, g });
    }
  };
  const glideTo = (now: number): boolean => {
    const t = now - g0;
    for (const { e, g } of glides) e.style.transform = glideFrame(g, t, GLIDE_T);
    return !glides.length || t >= GLIDE_T;
  };
  aim(before);
  const finishTo = (side: 0 | 1) => {
    if (job.done) return;
    job.done = true;
    cancelAnimationFrame(raf);
    for (const { e } of glides) e.style.transform = '';
    ov?.remove();
    under?.remove();
    // The cards take their own sheet back in the frame the plates go, with no fade of their own.
    stage.classList.add('settling');
    stage.classList.remove('morphing');
    settle(side === 1 ? B : A);
    onFinish(side);
    requestAnimationFrame(() => stage.classList.remove('settling'));
  };

  if (reduced()) {
    A.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: C.drift,
      fill: 'forwards',
    });
    B.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: C.drift });
    job.finishNow = () => finishTo(1);
    setTimeout(() => finishTo(1), 170);
    return job;
  }

  // The cards' sheets, read before the morph clears them.
  const sheet = new Map<
    string,
    { backgroundColor: string; borderColor: string; borderRadius: string }
  >();
  for (const c of $$('.card', from === 'pasos' ? A : to === 'pasos' ? B : stage)) {
    const cs = getComputedStyle(c);
    sheet.set(c.dataset.k ?? '', {
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      borderRadius: cs.borderTopLeftRadius,
    });
  }
  const lay = document.createElement('div');
  lay.className = 'ov';
  stage.appendChild(lay);
  ov = lay;
  // The plates go under the views, so a card's own lines show on the plate that stands for its
  // sheet; the travelling copies go over them.
  const low = document.createElement('div');
  low.className = 'ov under';
  stage.prepend(low);
  under = low;
  stage.classList.add('morphing');
  const view = stage.closest<HTMLElement>('.view') ?? stage;
  const sr = stage.getBoundingClientRect();
  const vr = view.getBoundingClientRect();
  const rel = (el: Element): R => {
    const r = el.getBoundingClientRect();
    return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
  };
  const isNear = (r: R) => near(r, sr.top, vr);
  const aCard = from === 'pasos';
  const bCard = to === 'pasos';
  const q = (root: HTMLElement, id: string, part: string) =>
    root.querySelector<HTMLElement>(`[data-s="${CSS.escape(`${id}:${part}`)}"]`);
  const ids = $$('[data-s$=":t"]', B)
    .filter((e) => !e.closest('.ghost'))
    .map((e) => (e.dataset.s ?? '').replace(/:t$/, ''));
  const cloneAt = (src: HTMLElement, r: R, extra = '') =>
    copyOf(src, r, lay, { wrap: true, extra });
  // The same row on both sides: Lista ⇄ Tabla.
  const sameRow = !aCard && !bCard;
  const glyph = (el: Element): Pt => {
    const g = glyphOf(el);
    return { x: g.left - sr.left, y: g.top - sr.top };
  };
  const fontOf = (el: Element) => parseFloat(getComputedStyle(el).fontSize) || 1;
  // The destination's copy c of b, starting from a's glyphs.
  const trip = (a: HTMLElement, b: HTMLElement, c: HTMLElement): Trip => {
    const to = glyph(b);
    return {
      c,
      from: glyph(a),
      to,
      o: { x: to.x - parseFloat(c.style.left), y: to.y - parseFloat(c.style.top) },
      s0: fontOf(a) / fontOf(b),
    };
  };

  // Cards travel column by column: their delay from where they stand in Pasos.
  const order = new Map<string, number>();
  if (aCard || bCard) {
    for (const c of $$('.card', aCard ? A : B)) {
      const col = Number(c.closest<HTMLElement>('.col')?.dataset.col ?? 0);
      const i = [...(c.parentNode?.children ?? [])].indexOf(c);
      order.set(c.dataset.k ?? '', morphDelay({ col, i }));
    }
  }

  const parts: Piece[] = [];
  const show = (...els: (HTMLElement | null)[]) => {
    for (const e of els) if (e) e.style.visibility = 'visible';
  };
  ids.forEach((id, idx) => {
    const tA = q(A, id, 't');
    const tB = q(B, id, 't');
    if (!tA || !tB) return;
    const rA = rel(tA);
    const rB = rel(tB);
    if (!isNear(rA) && !isNear(rB)) {
      for (const k of KEYS) show(q(A, id, k), q(B, id, k));
      return;
    }
    const P: Piece = {
      id,
      from: 0,
      T: Tt.morph(Math.hypot(rA.x - rB.x, rA.y - rB.y)),
      d: order.get(id) ?? morphDelay({ idx }),
      tA: cloneAt(tA, rA),
      tB: cloneAt(tB, rB),
      rA,
      rB,
      fA: parseFloat(getComputedStyle(tA).fontSize),
      fB: parseFloat(getComputedStyle(tB).fontSize),
    };
    if (sameRow) P.trips = [trip(tA, tB, P.tB)];
    const iA = q(A, id, 'id');
    const iB = q(B, id, 'id');
    if (iA && iB) {
      P.iA = rel(iA);
      P.iB = rel(iB);
      P.idc = cloneAt(iB, P.iB);
      if (sameRow) P.trips?.push(trip(iA, iB, P.idc));
    }
    for (const k of ['who', 'when'] as const) {
      const xa = q(A, id, k);
      const xb = q(B, id, k);
      if (xa && xb && isNear(rel(xb))) {
        const ra = rel(xa);
        const rb = rel(xb);
        P[k] = { ra, rb, ca: cloneAt(xa, ra), cb: cloneAt(xb, rb) };
        if (sameRow) P.trips?.push(trip(xa, xb, P[k].cb));
      }
    }
    const nA = q(A, id, 'node') ?? q(A, id, 'edge');
    const nB = q(B, id, 'node') ?? q(B, id, 'edge');
    if (nA && nB) {
      P.nA = rel(nA);
      P.nB = rel(nB);
      P.aEdge = nA.classList.contains('edge');
      P.bEdge = nB.classList.contains('edge');
      const src = nodeFrom(P.aEdge, P.bEdge) === 'b' ? nB : nA;
      P.nd = cloneAt(src, rel(src), 'width:24px;overflow:visible');
      P.nd.style.transformOrigin = '50% 50%';
      // The pen to an open item follows its node while it travels (pen.ts).
      P.nd.dataset.node = id;
      if (P.aEdge || P.bEdge) {
        // The card's own edge: its colour, its dashes when it waits, its glow when it is yours.
        const src = P.aEdge ? nA : nB;
        const e = copyOf(src, rel(src), lay);
        lay.prepend(e);
        P.edge = e;
      }
    }
    if (aCard || bCard) {
      const card = (aCard ? A : B).querySelector(`.card[data-k="${CSS.escape(id)}"]`);
      const band = (aCard ? B : A).querySelector(`.row[data-k="${CSS.escape(id)}"] .band`);
      if (card && band) {
        P.cardR = rel(card);
        P.bandR = rel(band);
        const plate = document.createElement('div');
        plate.className = 'plate';
        const look = sheet.get(id);
        if (look) {
          plate.style.backgroundColor = look.backgroundColor;
          plate.style.borderColor = look.borderColor;
          plate.style.borderRadius = look.borderRadius;
        }
        low.appendChild(plate);
        P.plate = plate;
      }
    }
    if (sameRow) {
      const k = CSS.escape(id);
      const ra = A.querySelector(`.lanes > [data-k="${k}"]`);
      const rb = B.querySelector(`.lanes > [data-k="${k}"]`);
      if (ra && rb) P.rowDy = rel(ra).y - rel(rb).y;
    }
    parts.push(P);
  });
  const partOf = new Map(parts.map((P) => [P.id, P]));
  const partIds = new Set(parts.map((P) => P.id));
  for (const e of [...$$('[data-s]', A), ...$$('[data-s]', B)]) {
    if (!partIds.has((e.dataset.s ?? '').replace(/:[a-z]+$/, ''))) e.style.visibility = 'visible';
  }

  // What only one side has: the old side dissolves, the new side resolves behind the ink head
  // (lists) or column by column (Pasos).
  const bTop = rel(B).y;
  const bBlocks = bCard
    ? []
    : [...$$('.lanes > [data-k]:not(.ghost)', B), ...$$('.thead, .lane-head', B)].map((e) => ({
        e,
        y: rel(e).y - bTop,
      }));
  const bLanes = $$<SVGPathElement>('.lines .ln', B);
  for (const p of bLanes) {
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1';
  }
  const keepLanes = sameRow; // Lista ⇄ Tabla: the lanes stay, only the rows resolve
  const bGlow = $$<SVGGElement>('svg.ink > .glow', B);
  const bBranch = $$<SVGGElement>('svg.ink > .branch', B);
  const bCols = bCard
    ? $$('.col', B).map((c, ci) => ({
        c,
        ci,
        o: 0,
        rule: c.querySelector<HTMLElement>('.rule'),
        bits: [
          c.querySelector<HTMLElement>('.colh h3'),
          c.querySelector<HTMLElement>('.colh .n'),
          ...c.querySelectorAll<HTMLElement>('.cm, .kids, .ch .who'),
        ].filter((e): e is HTMLElement => !!e),
      }))
    : [];
  const HB = Math.max(1, B.offsetHeight);
  const st = {
    t0: performance.now(),
    head0: 0,
    aOp0: 1,
    rev: false,
    resting: false,
    bOp: new Map<Element, number>(),
  };
  let head = 0;
  let aOp = 1;

  // A piece that lands is handed back: its copies go and its real pieces show, on a card its
  // sheet too, so the last frame is the destination's own; turned back, the copies return.
  const hand = (P: Piece, side: 0 | 1 | null) => {
    if (side === (P.landed ?? null)) return;
    P.landed = side;
    const on = side !== null;
    for (const c of [
      P.tA,
      P.tB,
      P.idc,
      P.who?.ca,
      P.who?.cb,
      P.when?.ca,
      P.when?.cb,
      P.nd,
      P.edge,
      P.plate,
    ]) {
      if (c) c.style.display = on ? 'none' : '';
    }
    for (const root of [A, B]) {
      const mine = on && root === (side === 1 ? B : A);
      for (const k of KEYS) {
        const e = q(root, P.id, k);
        if (e) e.style.visibility = mine ? 'visible' : '';
      }
      const card = root.querySelector<HTMLElement>(`.card[data-k="${CSS.escape(P.id)}"]`);
      const look = sheet.get(P.id);
      if (card && look) {
        card.style.backgroundColor = mine ? look.backgroundColor : '';
        card.style.borderColor = mine ? look.borderColor : '';
      }
    }
  };

  const frame = (now: number) => {
    const t = now - st.t0;
    const fwd = job.target === 1;
    let all = true;
    for (const P of parts) {
      const span = P.T * (st.rev ? clamp(Math.abs(job.target - P.from), 0.45, 1) : 1);
      const raw = clamp((t - (st.rev ? 0 : P.d)) / span);
      if (raw < 1) all = false;
      hand(P, landedOn(raw, job.target));
      const u = lerp(P.from, job.target, F.settle(raw));
      P.u = u;
      const x = lerp(P.rA.x, P.rB.x, u);
      const y = lerp(P.rA.y, P.rB.y, u);
      if (P.trips) {
        // One copy each, the destination's, from the old glyphs: nothing shows twice.
        P.tA.style.opacity = '0';
        if (P.who) P.who.ca.style.opacity = '0';
        if (P.when) P.when.ca.style.opacity = '0';
        for (const T of P.trips) {
          const f = travelFrame(T.from, T.to, T.o, T.s0, u);
          T.c.style.transform = moveOf(f.dx, f.dy, f.s);
        }
      } else {
        const tf = titleFrame(u);
        P.tA.style.transform = moveOf(x - P.rA.x, y - P.rA.y, lerp(1, P.fB / P.fA, u));
        P.tB.style.transform = moveOf(x - P.rB.x, y - P.rB.y, lerp(P.fA / P.fB, 1, u));
        P.tA.style.opacity = String(tf.a);
        P.tB.style.opacity = String(tf.b);
        P.tA.style.filter = P.tB.style.filter = blurOf(tf.blur);
      }
      if (P.idc && P.iA && P.iB && !P.trips) {
        P.idc.style.transform = moveOf((P.iA.x - P.iB.x) * (1 - u), (P.iA.y - P.iB.y) * (1 - u));
      }
      for (const k of ['who', 'when'] as const) {
        const W = P[k];
        if (!W || P.trips) continue;
        const wx = lerp(W.ra.x, W.rb.x, u);
        const wy = lerp(W.ra.y, W.rb.y, u);
        const wf = whoFrame(u);
        W.ca.style.transform = moveOf(wx - W.ra.x, wy - W.ra.y);
        W.cb.style.transform = moveOf(wx - W.rb.x, wy - W.rb.y);
        W.ca.style.opacity = String(wf.a);
        W.cb.style.opacity = String(wf.b);
      }
      if (P.plate && P.cardR && P.bandR) {
        const cu = aCard ? u : 1 - u;
        const R0 = P.cardR;
        const R1 = P.bandR;
        Object.assign(P.plate.style, {
          left: `${lerp(R0.x, R1.x, cu)}px`,
          top: `${lerp(R0.y, R1.y, cu)}px`,
          width: `${lerp(R0.w, R1.w, cu)}px`,
          height: `${lerp(R0.h, R1.h, cu)}px`,
          opacity: String(plateOpacity(cu, bCard)),
        });
      }
      if (P.nd && P.nA && P.nB) {
        if (P.aEdge || P.bEdge) {
          const cu = P.aEdge ? u : 1 - u;
          const eR = P.aEdge ? P.nA : P.nB;
          const nR = P.aEdge ? P.nB : P.nA;
          const ef = edgeFrame(cu);
          if (P.edge) {
            Object.assign(P.edge.style, {
              left: `${lerp(eR.x, nR.x + nR.w / 2 - 0.75, ef.eu)}px`,
              top: `${lerp(eR.y, nR.y + nR.h / 2, ef.eu)}px`,
              height: `${lerp(eR.h, 0, ef.eu)}px`,
              opacity: String(ef.edge),
            });
          }
          P.nd.style.transform = moveOf(
            (1 - ef.eu) * (eR.x - nR.x - nR.w / 2),
            (1 - ef.eu) * (eR.y + eR.h / 2 - nR.y - nR.h / 2),
            ef.scale,
          );
          P.nd.style.opacity = String(ef.node);
        } else {
          P.nd.style.transform = moveOf((P.nA.x - P.nB.x) * (1 - u), (P.nA.y - P.nB.y) * (1 - u));
        }
      }
    }
    // The ink head.
    head = inkHead({ fwd, t, h0: st.head0, rev: st.rev });
    for (const l of bLanes) l.style.strokeDashoffset = keepLanes ? '0' : String(1 - head);
    // The new lanes' light and branches come in behind the ink, as they do when a list draws in.
    if (!keepLanes) {
      for (const g of bGlow) g.style.opacity = String(clamp((head - 0.55) / 0.45));
      for (const g of bBranch) g.style.opacity = String(clamp((head - 0.65) / 0.35));
    }
    for (const { e, y } of bBlocks) {
      const P = sameRow ? partOf.get(e.dataset.k ?? '') : undefined;
      if (P?.rowDy !== undefined) {
        // The rest of the row comes with its title and its node, on the row's clock.
        const u = P.u ?? 0;
        const r = rowResolve(u);
        e.style.opacity = String(r);
        e.style.transform = moveOf(0, P.rowDy * (1 - u));
        e.style.filter = blurOf(1 - r);
        continue;
      }
      const r = clamp((head * HB - y + 8) / 56);
      e.style.opacity = String(r * r * (3 - 2 * r));
      e.style.transform = moveOf(-4 * (1 - r), 0);
      e.style.filter = blurOf(1 - r);
    }
    for (const col of bCols) {
      const o0 = st.bOp.get(col.c) ?? (fwd ? 0 : 1);
      const f = colFade({ fwd, t, ci: col.ci, o0, rev: st.rev });
      col.o = f.o;
      if (f.rule !== undefined && col.rule) {
        col.rule.style.transform = f.rule >= 1 ? '' : `scaleX(${f.rule})`;
      }
      for (const e of col.bits) {
        e.style.opacity = String(f.o);
        e.style.filter = blurOf(1 - f.o);
      }
    }
    const arrived = glideTo(now);
    aOp = aFade({ fwd, t, a0: st.aOp0 });
    A.style.opacity = String(aOp);
    A.style.filter = blurOf(1 - aOp);
    // Gone, it is out of the paint: a faded view still lifts what it overlaps onto layers that
    // draw their text otherwise.
    A.style.display = aOp < 0.001 ? 'none' : '';
    const resting =
      all &&
      arrived &&
      (fwd ? head >= 0.999 && t > 520 : head <= 0.001 && t > 300) &&
      (bCard && fwd ? t > 300 + 60 * bCols.length + 380 : true);
    const end = morphEnds(st.resting, resting);
    st.resting = resting;
    if (end) {
      finishTo(job.target);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  // The first frame is the starting pose, written now, in the same task as the change.
  frame(st.t0);
  job.reverse = () => {
    if (job.done) return;
    cancelAnimationFrame(raf);
    for (const P of parts) P.from = P.u ?? P.from;
    st.head0 = head;
    st.aOp0 = aOp;
    st.rev = true;
    st.resting = false;
    for (const col of bCols) st.bOp.set(col.c, col.o);
    job.target = job.target === 1 ? 0 : 1;
    st.t0 = performance.now();
    raf = requestAnimationFrame(frame);
  };
  job.finishNow = () => finishTo(job.target);
  job.reglide = (from) => {
    if (job.done) return;
    aim(from);
    glideTo(g0);
  };
  return job;
}
