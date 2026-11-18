// Lays out the Mermaid flowchart src/core/diagram.ts parses (the strict subset attach checks too),
// in ranks, for the diagram module.
import type { Diagram, DiagramEdge, DiagramNode } from '../../src/core/diagram.ts';

export {
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type Direction,
  type Parsed,
  parseDiagram,
} from '../../src/core/diagram.ts';

export type Placed = DiagramNode & { x: number; y: number; w: number; h: number };

export type Route = DiagramEdge & { d: string; lx: number; ly: number };

export type Drawing = { width: number; height: number; nodes: Placed[]; edges: Route[] };

const CHAR = 7.2;
const PAD = 28;
const RANK_GAP = 88;
const NODE_GAP = 30;
const MARGIN = 16;

// The edges that close a cycle: a walk from the nodes nothing points at (then from the rest, in the
// order the file names them) meets them going back to a node still on its path.
function backEdges({ nodes, edges }: Diagram): Set<DiagramEdge> {
  const out = new Map<string, DiagramEdge[]>(nodes.map(({ id }) => [id, []]));
  for (const edge of edges) out.get(edge.from)?.push(edge);
  const pointed = new Set(edges.filter(({ from, to }) => from !== to).map(({ to }) => to));
  const starts = [
    ...nodes.filter(({ id }) => !pointed.has(id)),
    ...nodes.filter(({ id }) => pointed.has(id)),
  ];
  const state = new Map<string, 'open' | 'done'>();
  const back = new Set<DiagramEdge>();
  const walk = (id: string) => {
    state.set(id, 'open');
    for (const edge of out.get(id) ?? []) {
      const seen = state.get(edge.to);
      if (seen === 'open') back.add(edge);
      else if (seen === undefined) walk(edge.to);
    }
    state.set(id, 'done');
  };
  for (const { id } of starts) if (!state.has(id)) walk(id);
  return back;
}

// Each node's rank: the longest path to it from a node nothing points at, with the edges that close
// a cycle left out, so every rank from 0 to the last holds a node.
function ranksOf(diagram: Diagram): Map<string, number> {
  const back = backEdges(diagram);
  const forward = diagram.edges.filter((edge) => edge.from !== edge.to && !back.has(edge));
  const rank = new Map(diagram.nodes.map(({ id }) => [id, 0]));
  for (let pass = 0; pass < diagram.nodes.length; pass += 1) {
    let moved = false;
    for (const { from, to } of forward) {
      const next = (rank.get(from) ?? 0) + 1;
      if (next > (rank.get(to) ?? 0)) {
        rank.set(to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const used = [...new Set(rank.values())].sort((a, b) => a - b);
  return new Map([...rank].map(([id, at]) => [id, used.indexOf(at)]));
}

// Within each rank, nodes sit near the middle of what links them to the rank before (then the rank
// after), which keeps edges from crossing where the file's order alone would cross them.
function orderColumns(
  columns: DiagramNode[][],
  edges: DiagramEdge[],
  ranks: ReadonlyMap<string, number>,
): DiagramNode[][] {
  const position = new Map<string, number>();
  const note = () =>
    columns.forEach((column) => {
      column.forEach(({ id }, index) => {
        position.set(id, index);
      });
    });
  note();
  const sweep = (index: number, neighbours: (id: string) => string[]) => {
    const column = columns[index] ?? [];
    const keyed = column.map((node, at) => {
      const near = neighbours(node.id)
        .map((id) => position.get(id))
        .filter((value): value is number => value !== undefined);
      const key = near.length ? near.reduce((sum, value) => sum + value, 0) / near.length : at;
      return { node, key, at };
    });
    keyed.sort((a, b) => a.key - b.key || a.at - b.at);
    columns[index] = keyed.map(({ node }) => node);
    note();
  };
  const into = (id: string) => edges.filter(({ to }) => to === id).map(({ from }) => from);
  const outOf = (id: string) => edges.filter(({ from }) => from === id).map(({ to }) => to);
  for (let round = 0; round < 2; round += 1) {
    for (let index = 1; index < columns.length; index += 1) sweep(index, into);
    for (let index = columns.length - 2; index >= 0; index -= 1) sweep(index, outOf);
  }
  // A node nothing links stands first in its rank, clear of the loops that run round the far side.
  // The ends of a loop back stand last, on the far side the loop runs round, so it leaves and
  // reaches them without crossing a node of their rank.
  const linked = new Set(edges.flatMap(({ from, to }) => [from, to]));
  const looping = new Set(
    edges
      .filter(({ from, to }) => (ranks.get(to) ?? 0) < (ranks.get(from) ?? 0))
      .flatMap(({ from, to }) => [from, to]),
  );
  columns.forEach((column, index) => {
    columns[index] = [
      ...column.filter(({ id }) => !linked.has(id)),
      ...column.filter(({ id }) => linked.has(id) && !looping.has(id)),
      ...column.filter(({ id }) => looping.has(id)),
    ];
  });
  return columns;
}

const sizeOf = (node: DiagramNode) => ({
  w: Math.max(
    96,
    Math.ceil(Math.max(node.title.length, (node.sub?.length ?? 0) * 0.9) * CHAR) + PAD,
  ),
  h: node.sub ? 54 : 40,
});

// An edge's cubic Bézier: its start, two control points and its end.
type Curve = [number, number, number, number, number, number, number, number];

type Box = { x: number; y: number; w: number; h: number };

const pointAt = ([x0, y0, x1, y1, x2, y2, x3, y3]: Curve, t: number) => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * x0 + b * x1 + c * x2 + e * x3, y: a * y0 + b * y1 + c * y2 + e * y3 };
};

// A label's box as DiagramView draws it (6.8px a letter, 8px each side, 20px high), with room
// around it.
const LABEL_ROOM = 3;
const labelBox = (label: string, x: number, y: number): Box => ({
  x: x - label.length * 3.4 - 8 - LABEL_ROOM,
  y: y - 10 - LABEL_ROOM,
  w: label.length * 6.8 + 16 + LABEL_ROOM * 2,
  h: 20 + LABEL_ROOM * 2,
});

const meets = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Where along its edge each label sits: halfway, unless that covers a node or a label already
// placed (the edges a decision fans out to meet halfway); then the nearest point along the same
// edge that covers neither, so a label never leaves its line.
const ALONG = [0.5, 0.6, 0.4, 0.7, 0.3, 0.78, 0.22, 0.85, 0.15];
function clearLabels(edges: Route[], curves: readonly Curve[], nodes: readonly Box[]): void {
  const taken: Box[] = [];
  edges.forEach((edge, index) => {
    const curve = curves[index];
    if (!edge.label || !curve) return;
    const label = edge.label;
    const fits = (box: Box) => ![...nodes, ...taken].some((other) => meets(box, other));
    const spot = ALONG.map((t) => pointAt(curve, t)).find(({ x, y }) =>
      fits(labelBox(label, x, y)),
    );
    if (spot) {
      edge.lx = spot.x;
      edge.ly = spot.y;
    }
    taken.push(labelBox(label, edge.lx, edge.ly));
  });
}

export function layoutDiagram(diagram: Diagram): Drawing {
  const across = diagram.direction === 'LR' || diagram.direction === 'RL';
  const ranks = ranksOf(diagram);
  const count = Math.max(0, ...ranks.values()) + 1;
  const columns: DiagramNode[][] = Array.from({ length: count }, () => []);
  for (const node of diagram.nodes) columns[ranks.get(node.id) ?? 0]?.push(node);
  orderColumns(columns, diagram.edges, ranks);
  const sized = new Map(diagram.nodes.map((node) => [node.id, sizeOf(node)]));
  // Along the flow, each rank is as deep as its deepest node; across it, the ranks are centred.
  const depth = columns.map((column) =>
    Math.max(...column.map(({ id }) => (across ? sized.get(id)?.w : sized.get(id)?.h) ?? 0)),
  );
  const breadth = columns.map((column) =>
    column.reduce(
      (sum, { id }) => sum + ((across ? sized.get(id)?.h : sized.get(id)?.w) ?? 0) + NODE_GAP,
      -NODE_GAP,
    ),
  );
  const widest = Math.max(0, ...breadth);
  // Across (LR, RL), a labelled edge from one rank to the next runs along the gap between them:
  // the gap is wide enough to hold its label clear of both nodes.
  const gaps = columns.map(() => RANK_GAP);
  if (across)
    for (const { from, to, label } of diagram.edges) {
      const rank = ranks.get(from) ?? 0;
      if (!label || (ranks.get(to) ?? 0) !== rank + 1) continue;
      gaps[rank] = Math.max(gaps[rank] ?? RANK_GAP, labelBox(label, 0, 0).w + 2 * LABEL_ROOM + 12);
    }
  const placed = new Map<string, Placed>();
  let along = MARGIN;
  columns.forEach((column, index) => {
    let side = MARGIN + (widest - (breadth[index] ?? 0)) / 2;
    for (const node of column) {
      const { w, h } = sized.get(node.id) ?? { w: 96, h: 40 };
      const lead = (depth[index] ?? 0) - (across ? w : h);
      const x = across ? along + lead / 2 : side;
      const y = across ? side : along + lead / 2;
      placed.set(node.id, { ...node, x, y, w, h });
      side += (across ? h : w) + NODE_GAP;
    }
    along += (depth[index] ?? 0) + (gaps[index] ?? RANK_GAP);
  });
  const length = along - (gaps.at(-1) ?? RANK_GAP) + MARGIN;
  const span = widest + MARGIN * 2;
  let width = across ? length : span;
  let height = across ? span : length;
  // RL and BT are LR and TD read backwards.
  if (diagram.direction === 'RL' || diagram.direction === 'BT') {
    for (const node of placed.values()) {
      if (across) node.x = width - node.x - node.w;
      else node.y = height - node.y - node.h;
    }
  }
  width = Math.max(width, 120);
  height = Math.max(height, 60);
  // An edge that runs back against the flow (a cycle) loops round the outside, past every node, so
  // it never cuts through the ones between its ends.
  const LOOP = 36;
  const outer = across ? height - MARGIN : width - MARGIN;
  let looped = 0;
  const curves: Curve[] = [];
  const edges = diagram.edges.flatMap((edge): Route[] => {
    const a = placed.get(edge.from);
    const b = placed.get(edge.to);
    if (!a || !b) return [];
    const forward = across ? b.x >= a.x + a.w : b.y >= a.y + a.h;
    const backward = across ? b.x + b.w <= a.x : b.y + b.h <= a.y;
    if ((ranks.get(edge.to) ?? 0) < (ranks.get(edge.from) ?? 0)) {
      looped += 1;
      const reach = outer + LOOP * looped;
      if (across) {
        const x1 = a.x + a.w / 2;
        const x2 = b.x + b.w / 2;
        const y1 = a.y + a.h;
        const y2 = b.y + b.h;
        const d = `M${x1} ${y1} C${x1} ${reach} ${x2} ${reach} ${x2} ${y2}`;
        curves.push([x1, y1, x1, reach, x2, reach, x2, y2]);
        return [{ ...edge, d, lx: (x1 + x2) / 2, ly: (y1 + y2) / 8 + (reach * 3) / 4 }];
      }
      const y1 = a.y + a.h / 2;
      const y2 = b.y + b.h / 2;
      const x1 = a.x + a.w;
      const x2 = b.x + b.w;
      const d = `M${x1} ${y1} C${reach} ${y1} ${reach} ${y2} ${x2} ${y2}`;
      curves.push([x1, y1, reach, y1, reach, y2, x2, y2]);
      return [{ ...edge, d, lx: (x1 + x2) / 8 + (reach * 3) / 4, ly: (y1 + y2) / 2 }];
    }
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (across && (forward || backward)) {
      x1 = forward ? a.x + a.w : a.x;
      x2 = forward ? b.x : b.x + b.w;
      y1 = a.y + a.h / 2;
      y2 = b.y + b.h / 2;
    } else if (!across && (forward || backward)) {
      y1 = forward ? a.y + a.h : a.y;
      y2 = forward ? b.y : b.y + b.h;
      x1 = a.x + a.w / 2;
      x2 = b.x + b.w / 2;
    } else {
      // Same rank: from the side of one to the side of the other, across the flow.
      const below = across ? b.y > a.y : b.x > a.x;
      x1 = across ? a.x + a.w / 2 : below ? a.x + a.w : a.x;
      y1 = across ? (below ? a.y + a.h : a.y) : a.y + a.h / 2;
      x2 = across ? b.x + b.w / 2 : below ? b.x : b.x + b.w;
      y2 = across ? (below ? b.y : b.y + b.h) : b.y + b.h / 2;
    }
    const bend =
      across && (forward || backward)
        ? 'h'
        : !across && (forward || backward)
          ? 'v'
          : across
            ? 'v'
            : 'h';
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const curve: Curve =
      bend === 'h' ? [x1, y1, mx, y1, mx, y2, x2, y2] : [x1, y1, x1, my, x2, my, x2, y2];
    curves.push(curve);
    const [, , c1x, c1y, c2x, c2y] = curve;
    const d = `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
    return [{ ...edge, d, lx: mx, ly: my }];
  });
  // The loops bulge three quarters of the way to their reach; the drawing grows to hold them and
  // their labels.
  if (looped > 0) {
    const room = outer + ((LOOP * looped * 3) / 4 + (across ? 14 : 48)) + MARGIN;
    if (across) height = Math.max(height, room);
    else width = Math.max(width, room);
  }
  clearLabels(edges, curves, [...placed.values()]);
  return { width, height, nodes: [...placed.values()], edges };
}

// What a version adds to the one before: the nodes and edges it did not have.
export function addedSince(
  current: Diagram,
  previous: Diagram | undefined,
): { nodes: Set<string>; edges: Set<string> } {
  if (!previous) return { nodes: new Set(), edges: new Set() };
  const had = new Set(previous.nodes.map(({ id }) => id));
  const linked = new Set(previous.edges.map(edgeKey));
  return {
    nodes: new Set(current.nodes.filter(({ id }) => !had.has(id)).map(({ id }) => id)),
    edges: new Set(current.edges.map(edgeKey).filter((key) => !linked.has(key))),
  };
}

export const edgeKey = ({ from, to }: Pick<DiagramEdge, 'from' | 'to'>) => `${from}->${to}`;

// The lines of a version that the one before did not have, by their text.
export function addedLines(current: string, previous: string | undefined): Set<number> {
  if (previous === undefined) return new Set();
  const before = new Set(previous.split(/\r?\n/).map((line) => line.trim()));
  return new Set(
    current
      .split(/\r?\n/)
      .flatMap((line, index) => (line.trim() !== '' && !before.has(line.trim()) ? [index] : [])),
  );
}
