import { nodeOff } from './dom.ts';

// A parent's branch to its children (SPEC §4.6, mock:1883-1915): it leaves 6 px right of the
// parent title's left edge, 2 px under its meta line (so it never crosses the id), drops to the last child and bends into each with
// a 7 px elbow, ending 6 px before the child's title.

export type TreeKid = { el: HTMLElement; cy: number; end: number; top: number; h: number };
export type TreeGeom = { P: HTMLElement; bx: number; y0: number; ks: TreeKid[] };
export type TreeProgress = { leg: number; elbows: number[] };

const rowSel = (key: string) => `:scope > .row[data-k="${CSS.escape(key)}"]:not(.ghost)`;
const titleOf = (row: HTMLElement) =>
  row.querySelector<HTMLElement>('.tt') ?? row.querySelector<HTMLElement>('.t') ?? row;

// The horizontal translation in a computed transform: a row sliding in (the draw-in, the view
// morph's resolve) is measured where it stands, not where it is passing.
export function shiftOf(transform: string): number {
  const m = /^matrix(3d)?\((.*)\)$/.exec(transform.trim());
  if (!m) return 0;
  const v = (m[2] ?? '').split(',').map(Number);
  return (m[1] ? v[12] : v[4]) ?? 0;
}

// Where a parent's branch leaves it, in the list: 2 px under its meta line (row top + metaFoot),
// and never above 10 px under its node; a row without a meta line leaves it there.
export function legTop(top: number, node: number, metaFoot: number | null): number {
  const under = top + node + 10;
  return metaFoot === null ? under : Math.max(under, top + metaFoot + 2);
}

// The foot of a row's meta line, from the row's top (both under the same transform).
const metaFootOf = (row: HTMLElement): number | null => {
  const m = row.querySelector<HTMLElement>('.m');
  return m ? m.getBoundingClientRect().bottom - row.getBoundingClientRect().top : null;
};

// A row's title's left edge, as it stands in the layout.
const titleLeft = (row: HTMLElement) =>
  titleOf(row).getBoundingClientRect().left - shiftOf(getComputedStyle(row).transform);

// The child rows listed right under a parent row.
export function childRows(parent: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let el = parent.nextElementSibling;
  while (
    el instanceof HTMLElement &&
    el.classList.contains('row') &&
    el.classList.contains('child')
  ) {
    if (!el.classList.contains('ghost')) out.push(el);
    el = el.nextElementSibling;
  }
  return out;
}

export function treeGeom(list: HTMLElement, parentKey: string): TreeGeom | null {
  const P = list.querySelector<HTMLElement>(rowSel(parentKey));
  if (!P) return null;
  const kids = childRows(P);
  if (!kids.length) return null;
  const lr = list.getBoundingClientRect();
  const bx = Math.round(titleLeft(P) - lr.left + 6) + 0.5;
  const y0 = legTop(P.offsetTop, nodeOff(P), metaFootOf(P));
  const ks = kids.map((c) => ({
    el: c,
    cy: c.offsetTop + nodeOff(c),
    end: Math.round(titleLeft(c) - lr.left - 6),
    top: c.offsetTop,
    h: c.offsetHeight,
  }));
  return { P, bx, y0, ks };
}

// The branch's markup, drawn partly by prog (the tree fold) or whole.
export function branchPaths(
  g: Pick<TreeGeom, 'bx' | 'y0' | 'ks'>,
  prog?: TreeProgress | null,
): string {
  const last = g.ks[g.ks.length - 1];
  if (!last) return '';
  let s = `<path d="M${g.bx} ${g.y0}V${last.cy - 7}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${prog ? 1 - prog.leg : 0}" fill="none" stroke="var(--rule-2)" stroke-width="1" stroke-linecap="round"/>`;
  g.ks.forEach((c, i) => {
    const e = prog ? (prog.elbows[i] ?? 0) : 1;
    s += `<path d="M${g.bx} ${c.cy - 7}Q${g.bx} ${c.cy} ${g.bx + 7} ${c.cy}H${Math.max(g.bx + 8, c.end)}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - e}" fill="none" stroke="var(--rule-2)" stroke-width="1" stroke-linecap="round" ${e <= 0 ? 'opacity="0"' : ''}/>`;
  });
  return s;
}

const drawnBranches = new WeakMap<Element, string>();

// Every unfolded parent's branch, into the list's <g class="branch">. `override` replaces one
// parent's markup (the tree fold draws it partly).
export function drawBranches(list: HTMLElement, override?: { pid: string; html: string }): void {
  const g = list.querySelector(':scope > svg.ink .branch');
  if (!g) return;
  let s = '';
  for (const el of list.children) {
    if (!(el instanceof HTMLElement) || !el.classList.contains('row')) continue;
    if (el.classList.contains('child') || el.classList.contains('ghost')) continue;
    const key = el.dataset.k;
    if (!key) continue;
    if (override && override.pid === key) {
      s += override.html;
      continue;
    }
    const geom = treeGeom(list, key);
    if (geom) s += branchPaths(geom);
  }
  if (drawnBranches.get(g) !== s) {
    g.innerHTML = s;
    drawnBranches.set(g, s);
  }
}
