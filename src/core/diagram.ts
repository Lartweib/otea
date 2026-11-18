// The diagram module (ui/src/diagram.ts lays it out) draws a Mermaid flowchart an agent attached,
// without running Mermaid: a strict subset (`flowchart` or `graph`, LR/RL/TD/TB/BT, `id[label]`-style
// nodes, `-->`-style edges with an optional `|label|`) is parsed here, and attach checks a diagram
// with it. Nothing in the file can add links, scripts, HTML or images. A file outside the subset
// does not parse: the module shows its source and the line that stopped the parser.

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

// A failure says why as data (`why`, and `at`, the text it stopped at) for the page to word in its
// language; `message` is the English the CLI and agents read.
export type ParseFailure = 'header' | 'unread' | 'edge' | 'edgeEnd' | 'empty';

export type Parsed =
  | { ok: true; diagram: Diagram }
  | { ok: false; line: number; message: string; why: ParseFailure; at?: string };

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
  const fail = (line: number, message: string, why: ParseFailure, at?: string): Parsed => ({
    ok: false,
    line,
    message,
    why,
    ...(at === undefined ? {} : { at }),
  });
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
      if (!header)
        return fail(index + 1, 'expected "flowchart LR" (or TD, RL, BT) first', 'header');
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
      if (!found) return fail(index + 1, `cannot read "${rest}"`, 'unread', rest);
      const [whole, id = '', open, label] = found;
      node(id, open, label);
      if (previous !== undefined && pending) edges.push({ from: previous, to: id, ...pending });
      previous = id;
      pending = undefined;
      rest = rest.slice(whole.length).trim();
      if (rest === '') break;
      const edge = EDGE.exec(rest);
      if (!edge)
        return fail(index + 1, `expected an edge such as --> before "${rest}"`, 'edge', rest);
      const [arrow, kind = '', inline, piped] = edge;
      const text = (piped ?? inline)?.trim();
      pending = { dashed: kind.startsWith('-.'), ...(text ? { label: text } : {}) };
      rest = rest.slice(arrow.length).trim();
      if (rest === '') return fail(index + 1, 'an edge needs a node after it', 'edgeEnd');
    }
  }
  if (direction === undefined) return fail(1, 'the file is empty', 'empty');
  return { ok: true, diagram: { direction, nodes: [...nodes.values()], edges } };
}
