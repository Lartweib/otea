import { headAt, roomAt, TREE, treeDuration } from '../motion.ts';

// The tree draw: a parent's children are drawn in by the line of its branch. One head travels down
// the branch from the parent's type slot; every piece of the branch, every child row and the room
// the block takes read their progress from where the head is (geometry, not delays). A leg fills as
// the head passes it, an elbow draws out once the head reaches its child, and the child resolves
// over the next 40px of travel. The room follows the head and the rows after the block ride its
// edge. Folding plays the same geometry back up, last child first.
//
// Everything is measured from the list as it is, the children already in place: the rows are a
// flat list, so the block is the rows after the parent that sit deeper than it.

export type Tree = {
  // Where the head starts (leaving the parent) and ends (the last child resolved), in px of the
  // block, 0 at the top of the first child.
  start: number;
  end: number;
  // Rows drawn, open nested ones included.
  rows: number;
  apply: (head: number) => void;
  clear: () => void;
};

type Piece = { path: SVGPathElement; y0: number; y1: number };

type Child = {
  element: HTMLElement;
  top: number;
  height: number;
  // Where the head reaches the child: its elbow starts 8px above its title line.
  at: number;
  content: HTMLElement[];
  node: SVGElement | null;
};

const CONTENT = [
  '.row-fold',
  '.row-type',
  '.row-t1',
  '.row-t2',
  '.row-pri',
  '.row-who',
  '.row-when',
].map((part) => `:scope > .row > ${part}`);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const depthOf = (element: Element) => Number((element as HTMLElement).dataset.depth ?? 0);

// The rows nested under a parent row (an li of the list), deeper ones included.
export function childrenOf(parent: HTMLElement): HTMLElement[] {
  const depth = depthOf(parent);
  const children: HTMLElement[] = [];
  for (let next = parent.nextElementSibling; next instanceof HTMLElement; ) {
    if (depthOf(next) <= depth) break;
    children.push(next);
    next = next.nextElementSibling;
  }
  return children;
}

function piecesOf(row: HTMLElement, level: number, offset: number): Piece[] {
  return [...row.querySelectorAll<SVGPathElement>(':scope > .row-lines .br')]
    .filter((path) => Number(path.dataset.lv) >= level)
    .map((path) => ({
      path,
      y0: offset + Number(path.dataset.y0),
      y1: offset + Number(path.dataset.y1),
    }));
}

// The tree under a parent row, or undefined when nothing is nested under it. root: the list, whose
// blocks after the tree ride on its edge.
export function measureTree(parent: HTMLElement, root: HTMLElement): Tree | undefined {
  const level = depthOf(parent);
  const elements = childrenOf(parent);
  const first = elements[0];
  const last = elements.at(-1);
  if (!first || !last) return undefined;
  const origin = first.offsetTop;
  const children: Child[] = elements.map((element) => {
    const top = element.offsetTop - origin;
    return {
      element,
      top,
      height: element.offsetHeight,
      at: top + Number(element.dataset.node ?? 0) - 8,
      content: CONTENT.flatMap((selector) => [...element.querySelectorAll<HTMLElement>(selector)]),
      node: element.querySelector<SVGElement>(':scope > .row > .row-node'),
    };
  });
  const parentHeight = parent.offsetHeight;
  const pieces = [
    ...piecesOf(parent, level, -parentHeight),
    ...children.flatMap((child) => piecesOf(child.element, level, child.top)),
  ];
  const height = last.offsetTop + last.offsetHeight - origin;
  const lastChild = children.at(-1) as Child;
  const start = -parentHeight + Number(parent.dataset.node ?? 0) + 13;
  const end = lastChild.at + TREE.elbow * 0.4 + TREE.fade;
  const knots: [number, number][] = [
    [start, 0],
    ...children.map((child): [number, number] => [child.at, child.top + child.height]),
  ];
  const after = [...root.querySelectorAll<HTMLElement>('[data-flip]')].filter(
    (element) =>
      !last.contains(element) &&
      (last.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );

  const apply = (head: number) => {
    const room = roomAt(knots, head);
    for (const child of children) {
      const shown = Math.min(child.height, Math.max(0, room - child.top));
      child.element.style.clipPath =
        shown >= child.height ? '' : `inset(0 0 ${child.height - shown}px 0)`;
    }
    for (const element of after) element.style.transform = `translateY(${room - height}px)`;
    for (const { path, y0, y1 } of pieces) {
      path.style.strokeDasharray = '1';
      path.style.strokeDashoffset = String(1 - clamp01((head - y0) / (y1 - y0 || 1)));
    }
    for (const child of children) {
      const resolved = clamp01((head - child.at - TREE.elbow * 0.4) / TREE.fade);
      const c = 1 - (1 - resolved) ** 3;
      for (const element of child.content) {
        element.style.opacity = String(c);
        element.style.transform = c < 1 ? `translateX(${-6 * (1 - c)}px)` : '';
        element.style.filter = c < 1 ? `blur(${1.5 * (1 - c)}px)` : '';
      }
      if (child.node) child.node.style.opacity = String(c);
    }
  };

  const clear = () => {
    for (const child of children) {
      child.element.style.clipPath = '';
      for (const element of child.content) {
        element.style.opacity = '';
        element.style.transform = '';
        element.style.filter = '';
      }
      if (child.node) child.node.style.opacity = '';
    }
    for (const element of after) element.style.transform = '';
    for (const { path } of pieces) {
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '';
    }
  };

  return { start, end, rows: children.length, apply, clear };
}

// A run of the head from one point to another. It can be stopped where it is, and a new run started
// from there the other way: an interrupted fold or unfold reverses from its current point.
export type TreeRun = { head: () => number; stop: () => void };

export function runTree(
  tree: Tree,
  from: number,
  to: number,
  folding: boolean,
  done: () => void,
): TreeRun {
  const span = tree.end - tree.start;
  const share = span > 0 ? Math.abs(to - from) / span : 0;
  const duration = treeDuration(tree.rows, folding) * share;
  let head = from;
  let frame = 0;
  tree.apply(head);
  if (duration <= 0) {
    done();
    return { head: () => head, stop: () => undefined };
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / duration);
    head = from + (to - from) * headAt(u);
    tree.apply(head);
    if (u < 1) frame = requestAnimationFrame(step);
    else done();
  };
  frame = requestAnimationFrame(step);
  return { head: () => head, stop: () => cancelAnimationFrame(frame) };
}
