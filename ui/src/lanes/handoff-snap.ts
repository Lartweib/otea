import { nodeOff } from './dom.ts';
import { type Lane, type LaneParams, laneParams, type RowGeom, trunkAt } from './geometry.ts';
import type { Look } from './looks.ts';

// The handoff's snapshots (SPEC §5.1, mock:2028-2050): every block of a list where it stands, the
// lanes' params, and every item's state, before and after a data change.

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

// A snapshot end that never existed in the list: the trunk a closed row sinks into, or the agents'
// lane a row handed to you comes out of.
export type VirtualSnap = BlockSnap & { virtual: true; arrive?: boolean };

export function liteState(universe: Universe | undefined): LiteState {
  const o: LiteState = {};
  if (universe) for (const [k, v] of universe) o[k] = { h: v.lane, look: v.look, closed: v.closed };
  return o;
}

// Where a row that left because its item closed goes, or where one that came back comes from: the
// trunk, at its point nearest the row (the fuse, or a pinch in a grouped list; mock:2046-2050). Null when the item is not closed.
export function virtSink(Sx: Snap, k: string, other: BlockSnap): VirtualSnap | null {
  const st = Sx.st[k];
  if (!st?.closed) return null;
  const ny = trunkAt(Sx.ov, other.ny ?? other.top + (other.off ?? 0));
  return {
    ...other,
    virtual: true,
    top: ny - (other.off ?? 0),
    ny,
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
