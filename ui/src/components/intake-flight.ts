import { breathe } from '../lanes/breathe.ts';
import { nodeOff, rowOf } from '../lanes/dom.ts';
import { type Lane, X } from '../lanes/geometry.ts';
import { laneColor } from '../lanes/looks.ts';
import { anim } from '../motion/anim.ts';
import { reduced } from '../motion/reduced.ts';
import { Tt } from '../motion/time.ts';

// Created (SPEC §10.5, mock:3978-3991): the new row flies from where the form drew it (the preview
// row under "llega como") to its place in the list, Tt.travel on settle, with a breath on its lane.
// The row is caught the moment the list commits it (a MutationObserver runs before the paint), so
// its first frame is already at the preview: it is never seen at its place first.

const WAIT_MS = 1500;

// The row of the new item, as soon as the current view's list has it; null when it does not come
// (another board is listed: the item opens there instead).
export function rowArrives(id: string, timeout = WAIT_MS): Promise<HTMLElement | null> {
  const now = rowOf(id);
  if (now) return Promise.resolve(now);
  const main = document.querySelector('.main') ?? document.body;
  return new Promise((resolve) => {
    const done = (row: HTMLElement | null) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(row);
    };
    const observer = new MutationObserver(() => {
      const row = rowOf(id);
      if (row) done(row);
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = window.setTimeout(() => done(null), timeout);
  });
}

// Flies the row from the preview's rect; resolves with the row once the flight has started.
export async function landNewRow(id: string, from: DOMRect | null): Promise<HTMLElement | null> {
  const row = await rowArrives(id);
  if (!row || !from || reduced()) return row;
  const to = row.getBoundingClientRect();
  if (to.bottom < 0 || to.top > window.innerHeight) return row;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  row.style.zIndex = '3';
  anim(
    row,
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
    Tt.travel(dy),
    'settle',
    0,
    'none',
  ).finished.then(
    () => {
      row.style.zIndex = '';
    },
    () => {
      row.style.zIndex = '';
    },
  );
  const list = row.closest<HTMLElement>('.lanes');
  const svg = list?.querySelector<SVGSVGElement>(':scope > svg.ink') ?? null;
  const lane = (row.dataset.h as Lane | undefined) ?? 'ag';
  if (list) breathe(svg, X[lane], row.offsetTop + nodeOff(row), laneColor(lane), list.offsetHeight);
  return row;
}
