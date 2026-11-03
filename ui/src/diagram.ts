// The diagram module draws a Mermaid flowchart an agent attached, without running Mermaid: a strict
// subset (`flowchart` or `graph`, LR/RL/TD/TB/BT, `id[label]`-style nodes, `-->`-style edges with
// an optional `|label|`) is parsed here and laid out in ranks. Nothing in the file can add links,
// scripts, HTML or images. A file outside the subset does not parse: the module shows its source
// and the line that stopped the parser.

export type Direction = 'LR' | 'RL' | 'TD' | 'BT';

export type DiagramNode = {
  id: string;
  // The label's first part, and what follows its first " · " as a second, quieter line.
  title: string;
  sub?: string;
  shape: 'box' | 'round' | 'diamond';
};

export type DiagramEdge = { from: string; to: string; label?: string; dashed: boolean };

export type Diagram = { direction: Direction; nodes: DiagramNode[]; edges: DiagramEdge[] };

export type Parsed = { ok: true; diagram: Diagram } | { ok: false; line: number; message: string };

const HEADER = /^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)\s*;?$/;
const IGNORED = /^(?:classDef|class|style|linkStyle|click|subgraph|end|direction)\b/;
const NODE =
  /^([A-Za-z0-9_]+)(?:(\[\[|\[\(|\(\(|\(\[|\[|\(|\{)(.*?)(\]\]|\)\]|\)\)|\]\)|\]|\)|\}))?(?::::[\w-]+)?/;
const EDGE = /^(-\.->|==>|-->|---|-\.-|--\s+([^-][^>]*?)\s+-->)(?:\|([^|]*)\|)?/;

function labelOf(raw: string): { title: string; sub?: string } {
  const text = raw.replace(/^"(.*)"$/, '$1').trim();
  const split = text.indexOf(' · ');
  if (split < 0) return { title: text };
  return { title: text.slice(0, split).trim(), sub: text.slice(split + 3).trim() };
}

const shapeOf = (open: string | undefined): DiagramNode['shape'] =>
  open === '{' ? 'diamond' : open === '(' || open === '((' || open === '([' ? 'round' : 'box';

export function parseDiagram(source: string): Parsed {
  const lines = source.split(/\r?\n/);
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  let direction: Direction | undefined;
  const fail = (line: number, message: string): Parsed => ({ ok: false, line, message });
  const node = (id: string, open?: string, label?: string) => {
    const known = nodes.get(id);
    if (known && label === undefined) return;
    nodes.set(id, { id, ...labelOf(label ?? known?.title ?? id), shape: shapeOf(open) });
  };
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim().replace(/;$/, '');
    if (line === '' || line.startsWith('%%')) continue;
    if (direction === undefined) {
      const header = HEADER.exec(line);
      if (!header) return fail(index + 1, 'expected "flowchart LR" (or TD, RL, BT) first');
      const named = header[1] === 'TB' ? 'TD' : header[1];
      direction = named as Direction;
      continue;
    }
    if (IGNORED.test(line)) continue;
    let rest = line;
    let previous: string | undefined;
    let pending: Omit<DiagramEdge, 'from' | 'to'> | undefined;
    while (rest !== '') {
      const found = NODE.exec(rest);
      if (!found) return fail(index + 1, `cannot read "${rest}"`);
      const [whole, id = '', open, label] = found;
      node(id, open, label);
      if (previous !== undefined && pending) edges.push({ from: previous, to: id, ...pending });
      previous = id;
      pending = undefined;
      rest = rest.slice(whole.length).trim();
      if (rest === '') break;
      const edge = EDGE.exec(rest);
      if (!edge) return fail(index + 1, `expected an edge such as --> before "${rest}"`);
      const [arrow, kind = '', inline, piped] = edge;
      const text = (piped ?? inline)?.trim();
      pending = { dashed: kind.startsWith('-.'), ...(text ? { label: text } : {}) };
      rest = rest.slice(arrow.length).trim();
      if (rest === '') return fail(index + 1, 'an edge needs a node after it');
    }
  }
  if (direction === undefined) return fail(1, 'the file is empty');
  return { ok: true, diagram: { direction, nodes: [...nodes.values()], edges } };
}

export type Placed = DiagramNode & { x: number; y: number; w: number; h: number };

export type Route = DiagramEdge & { d: string; lx: number; ly: number };

export type Drawing = { width: number; height: number; nodes: Placed[]; edges: Route[] };

const CHAR = 7.2;
const PAD = 28;
const RANK_GAP = 88;
const NODE_GAP = 30;
const MARGIN = 16;

// Each node's rank: the longest path to it from a node nothing points at; edges back up a cycle
// are left out of the count.
function ranksOf({ nodes, edges }: Diagram): Map<string, number> {
  const rank = new Map(nodes.map(({ id }) => [id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const { from, to } of edges) {
      const next = (rank.get(from) ?? 0) + 1;
      if (from !== to && next > (rank.get(to) ?? 0) && next < nodes.length) {
        rank.set(to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return rank;
}

const sizeOf = (node: DiagramNode) => ({
  w: Math.max(
    96,
    Math.ceil(Math.max(node.title.length, (node.sub?.length ?? 0) * 0.9) * CHAR) + PAD,
  ),
  h: node.sub ? 54 : 40,
});

export function layoutDiagram(diagram: Diagram): Drawing {
  const across = diagram.direction === 'LR' || diagram.direction === 'RL';
  const ranks = ranksOf(diagram);
  const columns: DiagramNode[][] = [];
  for (const node of diagram.nodes) {
    const at = ranks.get(node.id) ?? 0;
    columns[at] = [...(columns[at] ?? []), node];
  }
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
    along += (depth[index] ?? 0) + RANK_GAP;
  });
  const length = along - RANK_GAP + MARGIN;
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
  const edges = diagram.edges.flatMap((edge): Route[] => {
    const a = placed.get(edge.from);
    const b = placed.get(edge.to);
    if (!a || !b) return [];
    const forward = across ? b.x >= a.x + a.w : b.y >= a.y + a.h;
    const backward = across ? b.x + b.w <= a.x : b.y + b.h <= a.y;
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
    const d =
      bend === 'h'
        ? `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
        : `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
    return [{ ...edge, d, lx: mx, ly: my }];
  });
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
