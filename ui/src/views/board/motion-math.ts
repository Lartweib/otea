import { clamp, F, lerp, sstep } from '../../motion/curves.ts';

// The pure part of the board's motion: the tree fold's clock and geometry (mock:2298-2352) and the
// morph's per-frame values (mock:2441-2573). The DOM engines (tree.ts, morph-run.ts) only apply them.

// ---- the tree fold ----

// One ink head paints the children in: the same length both ways.
export const treeSpan = (n: number): number => Math.min(720, 220 + 64 * n);

// Turned back mid-way, it takes what is left of the way.
export const treeStepSpan = (D: number, target: number, u0: number): number =>
  Math.max(160, D * Math.abs(target - u0));

export type TreeLike = {
  y0: number;
  top: number;
  ks: readonly { cy: number; top: number; h: number }[];
};

// How much of the children's height shows when the ink head is at `head`.
export function revealAt(head: number, g: TreeLike): number {
  let prevY = g.y0;
  let prevR = 0;
  for (const c of g.ks) {
    const rEnd = c.top + c.h - g.top;
    if (head <= c.cy) {
      return prevR + (rEnd - prevR) * clamp((head - prevY) / Math.max(1, c.cy - prevY));
    }
    prevY = c.cy;
    prevR = rEnd;
  }
  return g.ks.reduce((s, c) => s + c.h, 0);
}

// A child resolves over 56 px of head: opacity, and the blur and the 6 px it comes from.
export const childResolve = (head: number, cy: number): number => {
  const r = clamp((head - (cy - 16)) / 56);
  return 1 - (1 - r) ** 3;
};

export function branchProgress(head: number, g: TreeLike): { leg: number; elbows: number[] } {
  const last = g.ks[g.ks.length - 1];
  const end = last ? last.cy - 7 : g.y0;
  return {
    leg: clamp((head - g.y0) / Math.max(1, end - g.y0)),
    elbows: g.ks.map((c) => clamp((head - (c.cy - 20)) / 20)),
  };
}

// ---- the morph ----

// Cards go column by column; rows by their order.
export function morphDelay(at: { col: number; i: number } | { idx: number }): number {
  if ('idx' in at) return Math.min(140, 18 * at.idx);
  return Math.min(200, 70 * at.col + 22 * at.i);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

// The title travels as two copies: the old one leaves while the new one arrives.
export function titleFrame(u: number): { a: number; b: number; blur: number } {
  return {
    a: 1 - sstep(clamp((u - 0.15) / 0.45)),
    b: sstep(clamp((u - 0.25) / 0.45)),
    blur: Math.max(0, r2(0.7 * Math.sin(Math.PI * clamp((u - 0.15) / 0.55)))),
  };
}

export function whoFrame(u: number): { a: number; b: number } {
  return { a: 1 - sstep(clamp((u - 0.1) / 0.4)), b: sstep(clamp((u - 0.35) / 0.4)) };
}

// cu runs from the card (0) to the row (1): the edge gathers into the node, which grows out of it.
export function edgeFrame(cu: number): { eu: number; edge: number; node: number; scale: number } {
  const eu = clamp(cu / 0.6);
  const node = sstep(clamp((cu - 0.4) / 0.45));
  return { eu, edge: 1 - sstep(clamp((cu - 0.45) / 0.2)), node, scale: lerp(0.4, 1, node) };
}

// The card's plate becomes the row's band: toward Pasos it goes almost at once (the card itself
// resolves at the end), toward a list it fades as it reaches the band.
export function plateOpacity(cu: number, toCards: boolean): number {
  return 1 - sstep(clamp((cu - (toCards ? 0.02 : 0.08)) / (toCards ? 0.25 : 0.42)));
}

// The ink head that draws the new lanes and resolves the new side's blocks.
export function inkHead(o: { fwd: boolean; t: number; h0: number; rev: boolean }): number {
  if (o.fwd) {
    return lerp(o.h0, 1, F.ink(clamp((o.t - (o.rev ? 0 : 140)) / Math.max(160, 640 * (1 - o.h0)))));
  }
  return lerp(o.h0, 0, F.ink(clamp(o.t / Math.max(160, 480 * o.h0))));
}

export function aFade(o: { fwd: boolean; t: number; a0: number }): number {
  return o.fwd ? o.a0 * (1 - F.drift(clamp(o.t / 220))) : lerp(o.a0, 1, F.drift(clamp(o.t / 300)));
}

// Toward Pasos each column traces its rule, then its head and cards resolve.
export function colFade(o: { fwd: boolean; t: number; ci: number; o0: number; rev: boolean }): {
  o: number;
  rule?: number;
} {
  if (!o.fwd) return { o: o.o0 * (1 - F.drift(clamp(o.t / 200))) };
  const d = o.rev ? 0 : 300 + 60 * o.ci;
  const op = lerp(o.o0, 1, F.drift(clamp((o.t - d - 60) / 320)));
  return o.rev ? { o: op } : { o: op, rule: F.ink(clamp((o.t - d) / 420)) };
}

// The morph ends a frame after everything is at rest: the frame it comes to rest shows the
// destination's own pieces, and the end removes nothing that was still being drawn.
export function morphEnds(restingBefore: boolean, restingNow: boolean): boolean {
  return restingBefore && restingNow;
}

// Only what is within the viewport and 160 px around it travels.
export function near(
  r: { y: number; h: number },
  stageTop: number,
  vr: { top: number; bottom: number },
): boolean {
  return r.y + stageTop < vr.bottom + 160 && r.y + r.h + stageTop > vr.top - 160;
}

// ---- the board column's glide ----

// On a wide screen each view sets the board column's width (board.css), so a switch moves the
// head, the tools and the stage. Each is laid out at once where it ends and glides there from where
// it was, on the morph's clock. A rule (data-leaf="w") also stretches from its old width.
export const GLIDE_T = 480;

type Edge = { left: number; top: number; width: number };
export type Glide = { dx: number; dy: number; sx: number };

export function glideFrom(a: Edge, b: Edge, stretch: boolean): Glide | null {
  const dx = a.left - b.left;
  const dy = a.top - b.top;
  const sx = stretch && b.width > 0 ? a.width / b.width : 1;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.004) return null;
  return { dx, dy, sx };
}

// Its transform t ms in: nothing once it has arrived, so the last frame is the layout itself.
export function glideFrame(g: Glide, t: number, T: number): string {
  const k = 1 - F.settle(clamp(t / T));
  if (k < 1e-4) return '';
  const move = `translate(${g.dx * k}px, ${g.dy * k}px)`;
  return Math.abs(g.sx - 1) < 1e-4 ? move : `${move} scale(${1 + (g.sx - 1) * k}, 1)`;
}
