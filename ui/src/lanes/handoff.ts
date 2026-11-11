import { motionBus } from '../motion/bus.ts';
import { C } from '../motion/curves.ts';
import { wait } from '../motion/drive.ts';
import { nodeOff } from './dom.ts';
import { type Lane, type LaneParams, laneParams, type RowGeom } from './geometry.ts';
import type { Look } from './looks.ts';

// The handoff (SPEC §5): every data change in a list runs through runHandoff. The lists slice owns
// this file and replaces runHandoff's body with the full engine (Plegar and Deslizar, mock:2072-2253);
// the foundation ships snap, virtSink, the preference and the reduced-motion branch, so every slice
// builds against the same contract.

export type HandoffStyle = 'plegar' | 'deslizar';

const KEY = 'otea.handoff';

export function handoffStyle(): HandoffStyle {
  try {
    return localStorage.getItem(KEY) === 'deslizar' ? 'deslizar' : 'plegar';
  } catch {
    return 'plegar';
  }
}

export function setHandoffStyle(s: HandoffStyle): void {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    // kept for this page only
  }
}

export type Universe = ReadonlyMap<string, { lane: Lane; look: Look; closed: boolean }>;

export type BlockSnap = {
  el: HTMLElement;
  top: number;
  h: number;
  w: number;
  row?: boolean;
  lane?: Lane;
  look?: Look;
  sec?: string;
  off?: number;
  ny?: number;
  color?: string | null;
  dropped?: boolean;
  n?: string;
};

export type LiteState = Record<string, { h: Lane; look: Look; closed: boolean }>;

export type Snap = { m: Map<string, BlockSnap>; ov: LaneParams; st: LiteState };

// A snapshot end that never existed in the list: the trunk a closed row sinks into.
export type VirtualSnap = BlockSnap & { virtual: true; arrive?: boolean };

export function liteState(universe: Universe | undefined): LiteState {
  const o: LiteState = {};
  if (universe) for (const [k, v] of universe) o[k] = { h: v.lane, look: v.look, closed: v.closed };
  return o;
}

// Where a row that left because its item closed goes, or where one that came back comes from: the
// trunk, at the fuse (mock:2046-2050). Null when the item is not closed.
export function virtSink(Sx: Snap, k: string, other: BlockSnap): VirtualSnap | null {
  const st = Sx.st[k];
  if (!st?.closed) return null;
  return {
    ...other,
    virtual: true,
    top: Sx.ov.fuseAt - (other.off ?? 0),
    ny: Sx.ov.fuseAt,
    lane: 'none',
    look: st.look,
    sec: '__trunk',
    dropped: st.look === 'dropped',
  };
}

const blocksOf = (list: HTMLElement): HTMLElement[] =>
  [...list.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && !!el.dataset.k && !el.classList.contains('ghost'),
  );

// The rows of a list as the lanes measure them.
export function measureRows(list: HTMLElement): RowGeom[] {
  return blocksOf(list)
    .filter((el) => el.classList.contains('row'))
    .map((el) => ({
      key: el.dataset.k ?? '',
      top: el.offsetTop,
      height: el.offsetHeight,
      off: nodeOff(el),
      lane: (el.dataset.h ?? 'ag') as Lane,
      look: (el.dataset.look ?? 'queued') as Look,
    }));
}

export function listParams(list: HTMLElement): LaneParams {
  return laneParams(
    measureRows(list),
    list.offsetHeight,
    list.offsetWidth,
    list.dataset.list === 'atasco',
  );
}

// Every block of the list where it stands, the lanes' params, and every item's state (mock:2030-2045).
export function snap(list: HTMLElement, universe?: Universe): Snap {
  const m = new Map<string, BlockSnap>();
  for (const el of blocksOf(list)) {
    const o: BlockSnap = { el, top: el.offsetTop, h: el.offsetHeight, w: el.offsetWidth };
    if (el.classList.contains('row')) {
      o.row = true;
      o.lane = el.dataset.h as Lane;
      o.look = el.dataset.look as Look;
      if (el.dataset.sec !== undefined) o.sec = el.dataset.sec;
      o.off = nodeOff(el);
      o.ny = o.top + o.off;
      const t = el.querySelector('.tt') ?? el.querySelector('.t');
      o.color = t ? getComputedStyle(t).color : null;
      o.dropped = el.classList.contains('dropped');
    }
    const n = el.querySelector<HTMLElement>(':scope > .n .nv');
    if (n) o.n = n.dataset.v ?? n.textContent ?? '';
    m.set(el.dataset.k ?? '', o);
  }
  return { m, ov: listParams(list), st: liteState(universe) };
}

let seq = 0;

// Runs a data change in a list. LaneList has already committed the new blocks when it calls: A is
// the snapshot it kept from before, apply re-measures (redraws the lanes) and the after snapshot is
// taken here. Blocks that left are rendered by LaneList as .ghost until this resolves.
// Foundation stub: the reduced-motion branch for every change (160 ms crossfades in place,
// mock:2104-2112); the lists slice brings the full engine.
export function runHandoff(
  list: HTMLElement,
  A: Snap,
  apply: () => void,
  opts: { arrive?: boolean; onHalf?: () => void; universe?: Universe } = {},
): Promise<void> {
  const id = `h${++seq}`;
  motionBus.begin(id);
  apply();
  const B = snap(list, opts.universe);
  const sink = list.dataset.sink === '1';
  const fade = (el: HTMLElement, from: number, to: number, keep = false) =>
    el.animate([{ opacity: from }, { opacity: to }], {
      duration: 160,
      easing: C.drift,
      ...(keep ? { fill: 'forwards' as const } : {}),
    });
  for (const k of new Set([...A.m.keys(), ...B.m.keys()])) {
    const a = A.m.get(k);
    const b = B.m.get(k);
    const pre = a ?? (sink && b?.row ? virtSink(A, k, b) : null);
    const post = b ?? (sink && a?.row ? virtSink(B, k, a) : null);
    const el = (b ?? a)?.el;
    if (!el) continue;
    if (pre && post) {
      const moved = pre.top !== post.top || pre.look !== post.look || pre.lane !== post.lane;
      if ('virtual' in post) fade(el, 1, 0, true);
      else if (moved || 'virtual' in pre) fade(el, 0.25, 1);
    } else if (post) fade(el, 0, 1);
    else fade(el, 1, 0, true);
  }
  motionBus.half(id);
  opts.onHalf?.();
  return wait(180).then(() => {
    motionBus.end(id);
  });
}
