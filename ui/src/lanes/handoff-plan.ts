import type { Lane } from './geometry.ts';
import { type BlockSnap, type Snap, virtSink } from './handoff-snap.ts';
import type { Look } from './looks.ts';

// What a data change does to each block of a list, read from two snapshots (port of the sorting at
// the head of transition(), mock:2078-2101). Pure: it never touches the elements it carries.

// One end of a carry: a block as measured, or a virtual one (the trunk, the agents' lane).
export type End = BlockSnap & { virtual?: true; arrive?: boolean };

export type Carry = {
  k: string;
  el: HTMLElement;
  // The element's layout top now (after for a block still listed, before for one that left).
  ct: number;
  pre: End;
  post: End;
  // The lane and look the element is drawn with now.
  cur: Lane;
  curLook: Look;
  // It left the list: LaneList keeps it as a ghost until the handoff resolves.
  gone: boolean;
};

export type Plan = {
  carried: Carry[];
  rooms: { k: string; el: HTMLElement; dy: number }[];
  enters: { k: string; el: HTMLElement }[];
  leaves: { k: string; el: HTMLElement; top: number; w: number }[];
  restyles: { k: string; el: HTMLElement; pre: End; post: End }[];
};

export function planHandoff(
  A: Snap,
  B: Snap,
  o: { sink: boolean; arrive?: boolean | undefined },
): Plan {
  const plan: Plan = { carried: [], rooms: [], enters: [], leaves: [], restyles: [] };
  for (const k of new Set([...A.m.keys(), ...B.m.keys()])) {
    const a = A.m.get(k);
    const b = B.m.get(k);
    const pre: End | null = a ?? (o.sink && b?.row ? virtSink(A, k, b) : null);
    const post: End | null = b ?? (o.sink && a?.row ? virtSink(B, k, a) : null);
    const now = (b ?? a) as BlockSnap;
    const el = now.el;
    const ct = now.top;
    if (pre && post) {
      const moved =
        pre.lane !== post.lane || pre.sec !== post.sec || !!pre.virtual || !!post.virtual;
      if (pre.row && moved) {
        plan.carried.push({
          k,
          el,
          ct,
          pre,
          post,
          cur: now.lane ?? 'ag',
          curLook: now.look ?? 'queued',
          gone: !b,
        });
      } else {
        if (pre.top !== post.top) plan.rooms.push({ k, el, dy: pre.top - ct });
        if (pre.row && pre.look !== post.look) plan.restyles.push({ k, el, pre, post });
      }
    } else if (post) {
      const was = A.st[k];
      // Handed to you: it comes out of the agents' lane, at its own height (mock:2047, 2094).
      const arrives =
        !!post.row && post.lane === 'you' && (o.arrive || (was?.h === 'ag' && !was.closed));
      if (arrives) {
        const look: Look = was && was.look !== 'yours' ? was.look : 'working';
        plan.carried.push({
          k,
          el,
          ct,
          pre: { ...post, lane: 'ag', look, virtual: true, arrive: true },
          post,
          cur: post.lane ?? 'you',
          curLook: post.look ?? 'yours',
          gone: false,
        });
      } else plan.enters.push({ k, el });
    } else if (a) plan.leaves.push({ k, el, top: a.top, w: a.w });
  }
  return plan;
}
