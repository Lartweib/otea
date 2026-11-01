import {
  dissolveAt,
  lerp,
  lerpPath,
  MORPH,
  resolveAt,
  rowStagger,
  stepClock,
  travelAt,
} from '../morph.ts';

// The list-grid morph on the page (timing in morph.ts). Both views are laid out at once, stacked in
// the pane's layers; the grid's pieces are drawn where the list had them and carried home, the
// list's own pieces dissolve and the grid's resolve, and one overlay stands in for the lanes of both.
// Elements shared by the two views carry the same `data-m` key.

// What only the grid has: its header, select boxes, the cells the list row has no place for, the
// empty who. What only the list has: the fold and type slots, the priority, the rest of line two,
// the hover leaders.
const GRID_ONLY =
  '.grid-head > .gh, .grid-row > .gc-chk, .grid-row > .gc-enum, .grid-row > .gc-severity, .grid-row > .gc-text, .grid-row > .gc-type, .grid-row .grid-nobody, .grid-gh .group-yours';
const LIST_ONLY =
  '.row-fold, .row-type, .row-pri, .row-crumb, .row-crumb-sep, .row-progress, .row-values, .section-title .group-yours, .section-title .triage-open, .section-empty';
// Rows and headers whose rules, bands and outlines fade with the view they belong to (--c).
const GRID_ROWS = '.grid-row, .grid-head, .grid-gh';
const LIST_ROWS = '.rows > li, .section-title';
const TOUCHED = `[data-m], ${GRID_ONLY}, ${LIST_ONLY}, ${GRID_ROWS}, ${LIST_ROWS}`;
const SVG = 'http://www.w3.org/2000/svg';

type Box = { l: number; t: number; w: number; h: number; cx: number; cy: number };

type Pair = {
  from: HTMLElement | SVGElement;
  to: HTMLElement | SVGElement;
  a: Box;
  b: Box;
  node: boolean;
  title: boolean;
  scale: number;
  near: boolean;
};

type Piece = { el: HTMLElement | SVGElement; across: number; down: number; near: boolean };

type Row = { el: HTMLElement; down: number };

// The lanes of a view: its three paths and where its body starts in the layers.
type Lanes = { paths: string[]; top: number; height: number };

type Measured = {
  pairs: Pair[];
  gridOnly: Piece[];
  listOnly: Piece[];
  gridRows: Row[];
  listRows: Row[];
  list: Lanes | undefined;
  grid: Lanes | undefined;
  overlay: SVGSVGElement;
  paths: SVGPathElement[];
  lanes: SVGGElement;
};

function lanesOf(root: Element | null, layers: DOMRect): Lanes | undefined {
  const body = root?.querySelector('.lanes-body');
  const raw = root?.getAttribute('data-lanes');
  if (!root || !body || !raw) return undefined;
  try {
    const paths = JSON.parse(raw) as string[];
    const box = body.getBoundingClientRect();
    return { paths, top: box.top - layers.top, height: box.height };
  } catch {
    return undefined;
  }
}

const styled = (el: Element) => (el as HTMLElement | SVGElement).style;

export type MorphEngine = { measure: () => void; apply: (u: number) => void; clear: () => void };

// pane: the element that scrolls (the list pane), for what is in view. layers: the two views'
// container, list first.
export function morphEngine(layers: HTMLElement, pane: HTMLElement): MorphEngine {
  let measured: Measured | undefined;

  const reset = () => {
    for (const el of layers.querySelectorAll(TOUCHED)) {
      const style = styled(el);
      style.transform = '';
      style.opacity = '';
      style.filter = '';
      style.visibility = '';
      style.width = '';
      style.maxWidth = '';
      style.transformOrigin = '';
      style.transformBox = '';
      style.removeProperty('--c');
    }
  };

  function measure() {
    layers.dataset.morph = '1';
    reset();
    const list = layers.querySelector<HTMLElement>('[data-layer="list"]');
    const grid = layers.querySelector<HTMLElement>('[data-layer="grid"]');
    const origin = layers.getBoundingClientRect();
    const view = pane.getBoundingClientRect();
    const viewTop = view.top - origin.top;
    const viewHeight = pane.clientHeight || view.height || 600;
    const width = layers.clientWidth || 1;
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      const l = r.left - origin.left;
      const t = r.top - origin.top;
      return { l, t, w: r.width, h: r.height, cx: l + r.width / 2, cy: t + r.height / 2 };
    };
    const seen = (b: Box) => b.w > 0 && b.h > 0;
    const near = (b: Box) =>
      b.t + b.h > viewTop - MORPH.near && b.t < viewTop + viewHeight + MORPH.near;
    const down = (b: Box) => rowStagger(b.t, viewTop, viewHeight);
    const size = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize) || 1;
    const targets = new Map<string, HTMLElement | SVGElement>();
    for (const el of grid?.querySelectorAll<HTMLElement | SVGElement>('[data-m]') ?? []) {
      targets.set(el.dataset.m ?? '', el);
    }
    const pairs: Pair[] = [];
    const gridOnly: Piece[] = [];
    const listOnly: Piece[] = [];
    const used = new Set<string>();
    const piece = (el: HTMLElement | SVGElement, b: Box): Piece => ({
      el,
      across: Math.min(1, Math.max(0, b.l / width)),
      down: down(b),
      near: near(b),
    });
    for (const from of list?.querySelectorAll<HTMLElement | SVGElement>('[data-m]') ?? []) {
      const key = from.dataset.m ?? '';
      const node = from.tagName.toLowerCase() === 'g';
      // A node is measured by its shape: the orbit around it is sized by its radius too.
      const shapeOf = (el: Element) => (node ? (el.querySelector('.shape') ?? el) : el);
      const a = box(shapeOf(from));
      if (!seen(a)) continue;
      const to = targets.get(key);
      const b = to ? box(shapeOf(to)) : undefined;
      // Text travels only where it reads the same in both views (the list says until when an
      // agent holds an item, the grid how old it is).
      const same = node || key.endsWith(':t') || from.textContent === to?.textContent;
      if (!to || !b || !seen(b) || !same) {
        listOnly.push(piece(from, a));
        continue;
      }
      used.add(key);
      pairs.push({
        from,
        to,
        a,
        b,
        node,
        title: key.endsWith(':t'),
        scale: node ? a.w / Math.max(1, b.w) : size(from) / size(to),
        near: near(a) || near(b),
      });
    }
    for (const [key, el] of targets) {
      const b = box(el);
      if (!used.has(key) && seen(b)) gridOnly.push(piece(el, b));
    }
    for (const el of grid?.querySelectorAll<HTMLElement>(GRID_ONLY) ?? []) {
      const b = box(el);
      if (seen(b)) gridOnly.push(piece(el, b));
    }
    for (const el of list?.querySelectorAll<HTMLElement>(LIST_ONLY) ?? []) {
      const b = box(el);
      if (seen(b)) listOnly.push(piece(el, b));
    }
    const rows = (root: HTMLElement | null, selector: string) =>
      [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])].map((el) => ({
        el,
        down: down(box(el)),
      }));
    const overlay = document.createElementNS(SVG, 'svg');
    overlay.setAttribute('class', 'morph-lanes');
    overlay.setAttribute('width', '56');
    overlay.setAttribute('aria-hidden', 'true');
    const lanes = document.createElementNS(SVG, 'g');
    const paths = ['ln', 'lny', 'ln'].map((name) => {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', name);
      lanes.appendChild(path);
      return path;
    });
    overlay.appendChild(lanes);
    measured = {
      pairs,
      gridOnly,
      listOnly,
      gridRows: rows(grid, GRID_ROWS),
      listRows: rows(list, LIST_ROWS),
      list: lanesOf(list?.querySelector('.item-list') ?? null, origin),
      grid: lanesOf(grid?.querySelector('.grid') ?? null, origin),
      overlay,
      paths,
      lanes,
    };
  }

  const resolve = ({ el }: Piece, c: number) => {
    const style = styled(el);
    style.opacity = String(c);
    style.transform = c < 1 ? `translateX(${(-MORPH.slide * (1 - c)).toFixed(2)}px)` : '';
    style.filter = c > 0 && c < 1 ? `blur(${(MORPH.blur * (1 - c)).toFixed(2)}px)` : '';
  };

  function apply(u: number) {
    if (!measured) return;
    const m = measured;
    if (!m.overlay.isConnected) layers.appendChild(m.overlay);
    const t = travelAt(u);
    for (const pair of m.pairs) {
      const from = styled(pair.from);
      const to = styled(pair.to);
      if (!pair.near) {
        // Out of view: each side shows on its half of the clock.
        from.visibility = u < 0.5 ? '' : 'hidden';
        to.visibility = u >= 0.5 ? '' : 'hidden';
        continue;
      }
      from.visibility = 'hidden';
      const scale = lerp(pair.scale, 1, t);
      const dy = lerp(pair.a.cy, pair.b.cy, t) - pair.b.cy;
      if (pair.node) {
        to.transformBox = 'fill-box';
        to.transformOrigin = 'center';
        const dx = lerp(pair.a.cx, pair.b.cx, t) - pair.b.cx;
        to.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`;
        continue;
      }
      to.transformOrigin = '0 50%';
      const dx = lerp(pair.a.l, pair.b.l, t) - pair.b.l;
      to.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`;
      if (pair.title) {
        to.width = `${(lerp(pair.a.w, pair.b.w, t) / scale).toFixed(2)}px`;
        to.maxWidth = 'none';
      }
    }
    for (const piece of m.gridOnly) {
      if (piece.near) resolve(piece, resolveAt(u, piece.across, piece.down));
      else styled(piece.el).opacity = u >= 1 ? '' : '0';
    }
    for (const piece of m.listOnly) {
      if (piece.near) resolve(piece, dissolveAt(u, piece.across, piece.down));
      else styled(piece.el).opacity = u <= 0 ? '' : '0';
    }
    for (const row of m.gridRows) {
      row.el.style.setProperty('--c', resolveAt(u, 0.5, row.down).toFixed(3));
    }
    for (const row of m.listRows) {
      row.el.style.setProperty('--c', dissolveAt(u, 0, row.down).toFixed(3));
    }
    const { list, grid } = m;
    if (list && grid) {
      m.lanes.setAttribute('transform', `translate(0 ${lerp(list.top, grid.top, t).toFixed(2)})`);
      m.paths.forEach((path, index) => {
        path.setAttribute('d', lerpPath(list.paths[index] ?? '', grid.paths[index] ?? '', t));
      });
      const bottom = Math.max(list.top + list.height, grid.top + grid.height);
      m.overlay.setAttribute('height', String(Math.ceil(bottom + 2)));
    }
  }

  function clear() {
    reset();
    measured?.overlay.remove();
    delete layers.dataset.morph;
    measured = undefined;
  }

  return { measure, apply, clear };
}

// A morph on its way: its engine, where its clock is and which way it runs. Switching back while it
// runs only turns the clock around.
export type MorphRun = {
  engine: MorphEngine;
  u: number;
  dir: 1 | -1;
  stop: () => void;
};

// Runs the clock from its start to its end, a frame at a time; onDone after the last frame.
export function runMorph(
  engine: MorphEngine,
  dir: 1 | -1,
  onDone: (dir: 1 | -1) => void,
): MorphRun {
  let frame = 0;
  let last = performance.now();
  const run: MorphRun = {
    engine,
    u: dir > 0 ? 0 : 1,
    dir,
    stop: () => cancelAnimationFrame(frame),
  };
  engine.apply(run.u);
  const step = (now: number) => {
    run.u = stepClock(run.u, run.dir, now - last, MORPH.duration);
    last = now;
    engine.apply(run.u);
    if ((run.dir > 0 && run.u >= 1) || (run.dir < 0 && run.u <= 0)) {
      engine.clear();
      onDone(run.dir);
      return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return run;
}
