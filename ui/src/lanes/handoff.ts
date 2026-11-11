import { motionBus } from '../motion/bus.ts';
import { C, clamp, sstep } from '../motion/curves.ts';
import { type Drive, drive, wait } from '../motion/drive.ts';
import { reduced } from '../motion/reduced.ts';
import { breathe } from './breathe.ts';
import { type Lane, lanePaths, X } from './geometry.ts';
import { type Carry, type End, planHandoff } from './handoff-plan.ts';
import {
  type CarryGeom,
  deslizarPose,
  handoffClock,
  type Pose,
  plegarPose,
  progressAt,
} from './handoff-pose.ts';
import { type BlockSnap, type Snap, snap, type Universe } from './handoff-snap.ts';
import { handoffStyle } from './handoff-style.ts';
import { drawLight } from './light.ts';
import { type Look, laneColor, lookColor, lookGlyph } from './looks.ts';

// The handoff (SPEC §5, port of transition() and restyleInPlace(), mock:2072-2266): every data
// change in a list runs through runHandoff. A row that changes lane or section is carried (Plegar:
// it folds into a line of light at its node, travels as a fibre-optic pulse that takes its new
// colour on the way, and unfolds out of a line that grows from the node; Deslizar: it lifts on a
// plate and slides); the others make room; new blocks enter; gone ones leave; a look change in
// place is restyled. Counts hold and roll at the half (motionBus).

export {
  type BlockSnap,
  type LiteState,
  listParams,
  liteState,
  measureRows,
  type Snap,
  snap,
  type Universe,
  type VirtualSnap,
  virtSink,
} from './handoff-snap.ts';
export { type HandoffStyle, handoffStyle, setHandoffStyle } from './handoff-style.ts';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(html: string): SVGElement {
  const g = document.createElementNS(NS, 'g');
  g.innerHTML = html;
  return g.firstElementChild as SVGElement;
}

// A handoff in flight, per list: a new one takes over from where this one draws its rows.
type Flight = {
  // Where each moving element is drawn now: its offset from its layout top, and whether it is
  // folded (Plegar).
  where(): Map<HTMLElement, { dy: number; folded: boolean }>;
  // Ends it at once: every temporary element goes, every style is reset.
  finish(interrupted: boolean): void;
};

const flights = new WeakMap<HTMLElement, Flight>();

let seq = 0;
let gradSeq = 0;

// A copy of a block that left, laid where it stood: the engine moves and dissolves its own copy, so
// it never depends on how long LaneList keeps the original ghost.
function ghostCopy(el: HTMLElement, top: number, w: number, hidden: HTMLElement[]): HTMLElement {
  const g = el.cloneNode(true) as HTMLElement;
  g.classList.add('ghost');
  g.removeAttribute('data-k');
  g.removeAttribute('tabindex');
  g.setAttribute('aria-hidden', 'true');
  for (const s of g.querySelectorAll('[data-s],[data-leaf],[data-title]')) {
    s.removeAttribute('data-s');
    s.removeAttribute('data-leaf');
    s.removeAttribute('data-title');
  }
  g.style.top = `${top}px`;
  g.style.width = `${w}px`;
  g.style.transform = '';
  el.parentElement?.appendChild(g);
  el.style.visibility = 'hidden';
  hidden.push(el);
  return g;
}

// A snapshot moved to where its elements are drawn now (a handoff it takes over left them there).
function drawnAt(A: Snap, where: ReadonlyMap<HTMLElement, { dy: number }>): Snap {
  if (!where.size) return A;
  const m = new Map<string, BlockSnap>();
  for (const [k, b] of A.m) {
    const dy = where.get(b.el)?.dy ?? 0;
    m.set(k, dy ? { ...b, top: b.top + dy, ...(b.ny !== undefined ? { ny: b.ny + dy } : {}) } : b);
  }
  return { ...A, m };
}

// A look change in place (restart, reassign): the old look gives way, the orbit arrives, the check
// or slash draws, the lane breathes (mock:2255-2266).
function restyleInPlace(
  el: HTMLElement,
  pre: End,
  post: End,
  svg: SVGSVGElement | null,
  list: HTMLElement,
): void {
  const nd = el.querySelector('.nd');
  const own = nd?.querySelector('.lk');
  if (!nd || !own || !pre.look) return;
  const other = svgEl(lookGlyph(pre.look));
  nd.insertBefore(other, own);
  other
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: C.drift, fill: 'forwards' })
    .finished.then(
      () => other.remove(),
      () => other.remove(),
    );
  own.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 280,
    delay: 60,
    easing: C.drift,
    fill: 'backwards',
  });
  other.querySelector('.wd')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(0)' }], {
    duration: 360,
    easing: C.settle,
    fill: 'forwards',
  });
  own
    .querySelector('.orb')
    ?.animate([{ strokeDasharray: '0 65.4' }, { strokeDasharray: '13.9 51.5' }], {
      duration: 420,
      delay: 80,
      easing: C.glide,
      fill: 'backwards',
    });
  own.querySelector('.mk')?.animate([{ strokeDashoffset: 14 }, { strokeDashoffset: 0 }], {
    duration: 360,
    delay: 120,
    easing: C.ink,
    fill: 'backwards',
  });
  const lane = post.lane ?? 'ag';
  const [color, reach, k] =
    post.look === 'stuck'
      ? ['var(--warn)', 110, 0.8]
      : lane === 'none'
        ? ['var(--closed)', 90, 1]
        : ['var(--lane)', 150, 1];
  breathe(svg, X[lane], post.ny ?? 0, color, list.offsetHeight, reach, k);
}

type Flying = Carry & {
  g: CarryGeom;
  lift: HTMLElement | null;
  band: HTMLElement | null;
  nd: HTMLElement | null;
  oldLk?: SVGElement;
  newLk?: SVGElement;
  mark?: SVGElement | null;
  marked?: boolean;
  cA: string;
  cB: string;
  dest: string;
  pulse: HTMLElement;
  line?: HTMLElement;
  grad?: SVGElement;
  trail?: SVGElement;
  shown?: { y: number; folded: boolean };
};

const mixOf = (cA: string, cB: string, mx: number) =>
  mx <= 0 ? cA : mx >= 1 ? cB : `color-mix(in oklch, ${cA} ${(100 - mx * 100).toFixed(1)}%, ${cB})`;

// Runs a data change in a list. LaneList has already committed the new blocks when it calls: A is
// the snapshot it kept from before, apply re-measures (redraws the lanes) and the after snapshot is
// taken here. The first frame (the starting pose) is written before this returns, so the change is
// never painted at its destination first.
export function runHandoff(
  list: HTMLElement,
  A0: Snap,
  apply: () => void,
  opts: { arrive?: boolean; onHalf?: () => void; universe?: Universe } = {},
): Promise<void> {
  const before = flights.get(list);
  const where = before?.where() ?? new Map();
  before?.finish(true);
  const A = drawnAt(A0, where);
  const id = `h${++seq}`;
  motionBus.begin(id);
  apply();
  const B = snap(list, opts.universe);
  const sink = list.dataset.sink === '1';
  const plan = planHandoff(A, B, { sink, arrive: opts.arrive });
  const svg = list.querySelector<SVGSVGElement>(':scope > svg.ink');
  const fx = svg?.querySelector('.fx') ?? null;
  const temps: Element[] = [];
  const hidden: HTMLElement[] = [];
  const anims: Animation[] = [];

  // Blocks that left travel or dissolve as the engine's own copies.
  const carried = plan.carried.map((c) =>
    c.gone ? { ...c, el: ghostCopy(c.el, c.ct, c.pre.w, hidden) } : c,
  );
  const leaves = plan.leaves.map((l) => ghostCopy(l.el, l.top, l.w, hidden));
  temps.push(...carried.filter((c) => c.gone).map((c) => c.el), ...leaves);

  let halfDone = false;
  const half = () => {
    if (halfDone) return;
    halfDone = true;
    motionBus.half(id);
    opts.onHalf?.();
  };

  let resolve: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  let ended = false;
  let flight: Drive | null = null;
  let flying: Flying[] = [];
  const halos = svg?.querySelector<SVGGElement>('.glow .halos') ?? null;

  const finish = (interrupted: boolean) => {
    if (ended) return;
    ended = true;
    flight?.cancel();
    half();
    for (const a of anims) a.cancel();
    for (const x of temps) x.remove();
    for (const h of hidden) h.style.visibility = '';
    for (const c of flying) {
      c.el.style.zIndex = '';
      c.el.style.transform = '';
      if (c.lift) {
        c.lift.style.opacity = '';
        c.lift.style.clipPath = '';
      }
      if (c.band) {
        c.band.style.backgroundColor = '';
        c.band.style.boxShadow = '';
        c.band.style.transition = '';
      }
      if (c.nd) {
        c.nd.style.transform = '';
        c.nd.style.opacity = '';
      }
      if (c.oldLk) c.oldLk.style.opacity = '';
      if (c.newLk) c.newLk.style.opacity = '';
      if (c.mark) {
        for (const a of c.mark.getAnimations()) a.cancel();
        c.mark.style.strokeDashoffset = '';
      }
    }
    for (const r of plan.rooms) r.el.style.transform = '';
    if (flights.get(list) === flight_) flights.delete(list);
    apply();
    if (halos && flying.length) {
      for (const a of halos.getAnimations()) a.cancel();
      if (!interrupted)
        halos.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: C.drift });
    }
    motionBus.end(id);
    resolve();
  };

  const flight_: Flight = {
    where() {
      const m = new Map<HTMLElement, { dy: number; folded: boolean }>();
      for (const c of flying)
        if (!c.gone && c.shown) m.set(c.el, { dy: c.shown.y, folded: c.shown.folded });
      return m;
    },
    finish,
  };
  flights.set(list, flight_);

  // Reduced: short crossfades in place (mock:2104-2112).
  if (reduced()) {
    const fade = (el: HTMLElement, from: number, to: number, keep = false) =>
      anims.push(
        el.animate([{ opacity: from }, { opacity: to }], {
          duration: 160,
          easing: C.drift,
          ...(keep ? { fill: 'forwards' as const } : {}),
        }),
      );
    for (const c of carried) {
      if (c.post.virtual) fade(c.el, 1, 0, true);
      else fade(c.el, 0.25, 1);
    }
    for (const r of [...plan.rooms, ...plan.restyles]) fade(r.el, 0.25, 1);
    for (const e of plan.enters) fade(e.el, 0, 1);
    for (const l of leaves) fade(l, 1, 0, true);
    half();
    wait(180).then(() => finish(false));
    return done;
  }

  const style = handoffStyle();
  const { T, FA, total } = handoffClock(
    carried.map((c) => c.post.top - c.pre.top),
    style,
  );
  const fold = FA > 0;

  // Each carried row: its old look beside the new one, the pulse, the fold line, the trail, the
  // ghost ring where it left its lane, and its title's colour and strike.
  flying = carried.map((c) => {
    c.el.style.zIndex = '3';
    const lift = c.el.querySelector<HTMLElement>('.lift');
    const band = c.el.querySelector<HTMLElement>('.band');
    const nd = c.el.querySelector<HTMLElement>('.nd');
    const preLane: Lane = c.pre.lane ?? 'ag';
    const postLane: Lane = c.post.lane ?? 'ag';
    const preLook: Look = c.pre.look ?? 'queued';
    const postLook: Look = c.post.look ?? 'queued';
    const was = where.get(c.el);
    const f: Flying = {
      ...c,
      lift,
      band,
      nd,
      g: {
        dy0: c.pre.top - c.ct,
        dy1: c.post.top - c.ct,
        xa: X[preLane],
        xb: X[postLane],
        xc: X[c.cur],
        h: lift?.offsetHeight ?? c.post.h,
        w: c.el.offsetWidth,
        off: c.post.off ?? 19.5,
        ct: c.ct,
        preVirtual: !!c.pre.virtual,
        postVirtual: !!c.post.virtual,
        arrive: !!c.pre.arrive,
        ...(fold && was?.folded ? { folded: true } : {}),
      },
      cA: lookColor(preLane, preLook),
      cB: lookColor(postLane, postLook),
      dest: laneColor(postLane),
      pulse: document.createElement('div'),
    };
    if (nd && preLook !== postLook) {
      const own = nd.querySelector<SVGElement>('.lk');
      if (own) {
        const isOld = c.curLook === preLook;
        const other = svgEl(lookGlyph(isOld ? postLook : preLook));
        nd.insertBefore(other, own.nextSibling);
        temps.push(other);
        f.oldLk = isOld ? own : other;
        f.newLk = isOld ? other : own;
        f.oldLk.style.opacity = '1';
        f.newLk.style.opacity = '0';
        f.mark = f.newLk.querySelector<SVGElement>('.mk');
        if (f.mark) f.mark.style.strokeDashoffset = '14';
      }
    }
    f.pulse.className = 'sphere';
    list.appendChild(f.pulse);
    temps.push(f.pulse);
    if (fold) {
      f.line = document.createElement('div');
      f.line.className = 'fline';
      list.appendChild(f.line);
      temps.push(f.line);
    }
    if (fx) {
      const gid = `trg${++gradSeq}`;
      f.grad = svgEl(
        `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${f.dest}" stop-opacity="0"/><stop offset="1" stop-color="${f.dest}" stop-opacity=".9"/></linearGradient>`,
      );
      f.trail = svgEl(
        `<path fill="none" stroke="url(#${gid})" stroke-width="1.3" stroke-linecap="round"/>`,
      );
      fx.append(f.grad, f.trail);
      temps.push(f.grad, f.trail);
      if (!c.pre.virtual && preLane !== postLane && !was) {
        const ring = svgEl(
          `<circle cx="${f.g.xa}" cy="${c.pre.ny}" r="6" fill="none" stroke="var(--ink)" stroke-width="1.2" style="transform-box:fill-box;transform-origin:center"/>`,
        );
        fx.appendChild(ring);
        temps.push(ring);
        anims.push(
          ring.animate(
            [
              { opacity: 0.45, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.5)' },
            ],
            { duration: 560, easing: C.glide, fill: 'forwards' },
          ),
        );
      }
    }
    const tt = c.el.querySelector<HTMLElement>('.tt');
    if (tt && c.pre.color && c.post.color && c.pre.color !== c.post.color) {
      anims.push(
        tt.animate([{ color: c.pre.color }, { color: c.post.color }], {
          duration: 420,
          delay: T * 0.3,
          easing: C.drift,
          fill: 'backwards',
        }),
      );
    }
    if (tt && !!c.pre.dropped !== !!c.post.dropped) {
      anims.push(
        tt.animate(
          c.pre.dropped
            ? [{ backgroundSize: '100% 1px' }, { backgroundSize: '0% 1px' }]
            : [{ backgroundSize: '0% 1px' }, { backgroundSize: '100% 1px' }],
          { duration: 480, delay: T * 0.55, easing: C.ink, fill: 'backwards' },
        ),
      );
    }
    return f;
  });

  for (const r of plan.restyles) restyleInPlace(r.el, r.pre, r.post, svg, list);
  for (const e of plan.enters) {
    e.el.animate(
      [
        { opacity: 0, transform: 'translateY(-4px)', filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 380, delay: flying.length ? T * 0.55 : 60, easing: C.glide, fill: 'backwards' },
    );
  }
  for (const l of leaves) {
    l.animate(
      [
        { opacity: 1, filter: 'blur(0px)' },
        { opacity: 0, filter: 'blur(1px)' },
      ],
      { duration: 220, easing: C.drift, fill: 'forwards' },
    );
  }
  if (halos && flying.length) {
    for (const a of halos.getAnimations()) a.cancel();
    halos.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: C.drift,
      fill: 'forwards',
    });
  }

  const pA = A.ov;
  const pB = B.ov;
  const lines = svg ? [...svg.querySelectorAll<SVGPathElement>('.lines .ln')] : [];
  let breathed = false;

  // The light of agent and stuck nodes lies where the rows land (drawn once), and rides with the
  // rows that make room; a carried row's light comes in as it lands.
  const lit: { g: SVGGElement; y: number; dy: number; carried: boolean }[] = [];
  if (svg) {
    drawLight(svg, pB, { keepHalos: true });
    const roomDy = new Map(plan.rooms.map((r) => [r.k, r.dy]));
    const carriedKeys = new Set(carried.map((c) => c.k));
    const ags = [...svg.querySelectorAll<SVGGElement>('.glow .ags > g')];
    const warms = [...svg.querySelectorAll<SVGGElement>('.glow .warms > g')];
    for (const [k, b] of B.m) {
      if (!b.row) continue;
      const g =
        b.look === 'stuck'
          ? warms.shift()
          : b.lane === 'ag' && b.look === 'working' && !pB.atasco
            ? ags.shift()
            : undefined;
      if (g) lit.push({ g, y: b.ny ?? 0, dy: roomDy.get(k) ?? 0, carried: carriedKeys.has(k) });
    }
  }

  const frame = (t: number) => {
    const { p, pr } = progressAt(t, FA, T);
    for (const r of plan.rooms) r.el.style.transform = `translateY(${r.dy * (1 - pr)}px)`;
    const H = Math.max(pA.H, pB.H);
    if (svg) {
      svg.setAttribute('height', String(Math.max(1, H)));
      const paths = lanePaths({
        ...pB,
        H,
        lastOpen: pA.lastOpen + (pB.lastOpen - pA.lastOpen) * pr,
        fuseAt: pA.fuseAt + (pB.fuseAt - pA.fuseAt) * pr,
        closed: pr > 0.5 ? pB.closed : pA.closed,
      });
      const [lag, lyou, ltr] = lines;
      lag?.setAttribute('d', paths.ag);
      lyou?.setAttribute('d', paths.you);
      ltr?.setAttribute('d', paths.trunk);
      ltr?.setAttribute('stroke', paths.trunkStroke);
      for (const l of lit) {
        if (l.carried) l.g.style.opacity = sstep(clamp((t - FA - T * 0.9) / 240)).toFixed(3);
        else if (l.dy)
          l.g.setAttribute('transform', `translate(16.5 ${(l.y + l.dy * (1 - pr)).toFixed(1)})`);
      }
    }
    for (const c of flying) {
      const f: Pose = fold ? plegarPose(t, T, c.g) : deslizarPose(t, T, c.g);
      c.shown = { y: f.y, folded: fold && f.lift.opacity === 0 };
      c.el.style.transform = `translateY(${f.y}px)`;
      if (c.lift) {
        if (fold) {
          const [top, bottom] = f.lift.clip ?? [0, 0];
          c.lift.style.opacity = String(f.lift.opacity);
          c.lift.style.clipPath = `inset(${top.toFixed(1)}px -40px ${bottom.toFixed(1)}px -40px)`;
        } else if (c.g.preVirtual || c.g.postVirtual) {
          c.lift.style.opacity = f.lift.opacity.toFixed(3);
        }
      }
      if (!fold && c.band && !c.g.arrive) {
        const b = f.plate;
        c.band.style.backgroundColor = `color-mix(in oklch, var(--sheet) ${(sstep(clamp(b / 0.25)) * 100).toFixed(1)}%, transparent)`;
        c.band.style.boxShadow = `0 ${(12 * b).toFixed(1)}px ${(26 * b).toFixed(1)}px -${(13 * b).toFixed(1)}px color-mix(in oklch, var(--shadow) ${(b * 100).toFixed(0)}%, transparent), 0 0 0 1px color-mix(in oklch, var(--rule) ${(b * 100).toFixed(0)}%, transparent)`;
        c.band.style.transition = 'none';
      }
      if (c.nd) {
        c.nd.style.transform =
          !fold && f.nodeScale !== 1
            ? `translateX(${f.nodeDx}px) scale(${f.nodeScale.toFixed(3)})`
            : `translateX(${f.nodeDx}px)`;
        if (!fold) c.nd.style.opacity = f.nodeOpacity.toFixed(3);
      }
      if (c.oldLk && c.newLk) {
        c.oldLk.style.opacity = String(1 - f.newLook);
        c.newLk.style.opacity = String(f.newLook);
      }
      if (c.mark && !c.marked && f.mark) {
        c.marked = true;
        c.mark.animate([{ strokeDashoffset: 14 }, { strokeDashoffset: 0 }], {
          duration: 360,
          easing: C.ink,
          fill: 'forwards',
        });
      }
      const color = mixOf(c.cA, c.cB, f.mix);
      if (c.line) {
        Object.assign(c.line.style, {
          left: `${f.line.x}px`,
          top: `${f.line.y}px`,
          width: `${f.line.w.toFixed(1)}px`,
          opacity: f.line.o.toFixed(3),
        });
        c.line.style.setProperty('--c', color);
      }
      c.pulse.style.setProperty('--c', color);
      c.pulse.style.transform = `translate(${f.pulse.x}px, ${f.pulse.y}px) scale(${f.pulse.s.toFixed(3)})`;
      c.pulse.style.opacity = f.pulse.o.toFixed(3);
      if (c.trail && c.grad) {
        const dir = Math.sign(c.g.dy1 - c.g.dy0) || 1;
        const y0 = f.ny - dir * f.trail;
        for (const s of c.grad.children) (s as SVGElement).style.stopColor = color;
        c.trail.setAttribute('d', f.trail > 1 ? `M${f.nx} ${y0}L${f.nx} ${f.ny}` : '');
        c.grad.setAttribute('x1', String(f.nx));
        c.grad.setAttribute('x2', String(f.nx));
        c.grad.setAttribute('y1', String(y0));
        c.grad.setAttribute('y2', String(f.ny));
      }
      if (!breathed && f.breath && svg) {
        breathed = true;
        breathe(
          svg,
          c.g.xb,
          c.ct + c.g.off + c.g.dy1,
          c.dest,
          H,
          c.post.lane === 'none' ? 90 : 150,
        );
      }
    }
    if (p > 0.5 || !flying.length) half();
  };

  // The starting pose lands in this same task (drive calls the frame at 0 synchronously).
  flight = drive(total + 60, (_, t) => {
    if (ended) return;
    frame(t);
    if (t >= total + 60) finish(false);
  });
  return done;
}
