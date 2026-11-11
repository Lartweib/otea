// DOM helpers for the lists (SPEC §4.2): the current view, its list, a row by id, the order the
// detail's Anterior/Siguiente follow.

export type LaneListHandleLike = { redraw(): void };

// Every mounted list registers its redraw, so whoever changes layout (the detail opening, the rail
// folding) can redraw the lanes of a view at once.
const handles = new Map<HTMLElement, LaneListHandleLike>();

export function registerList(el: HTMLElement, handle: LaneListHandleLike): () => void {
  handles.set(el, handle);
  return () => {
    if (handles.get(el) === handle) handles.delete(el);
  };
}

export function redrawLists(scope: ParentNode = document): void {
  for (const [el, handle] of handles) {
    if (el.isConnected && (scope === document || scope.contains(el))) handle.redraw();
  }
}

// The view on screen (not one leaving).
export function curView(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.main .view:not(.leaving)');
}

// The list of the current view (not the morph's ghost copy).
export function curList(): HTMLElement | null {
  const v = curView();
  if (!v) return null;
  return [...v.querySelectorAll<HTMLElement>('.lanes')].find((l) => !l.closest('.mghost')) ?? null;
}

const notGhost = (el: Element) => !el.closest('.mghost');

export function rowOf(id: string | null | undefined): HTMLElement | null {
  const v = curView();
  if (!v || !id) return null;
  const k = CSS.escape(id);
  const sel = `.lanes > .row[data-k="${k}"]:not(.ghost), .cards > .card[data-k="${k}"]:not(.ghost)`;
  return [...v.querySelectorAll<HTMLElement>(sel)].find(notGhost) ?? null;
}

export function listOrder(): string[] {
  const v = curView();
  if (!v) return [];
  const sel = '.lanes > .row:not(.ghost):not(.inert), .cards > .card:not(.ghost)';
  return [...v.querySelectorAll<HTMLElement>(sel)]
    .filter(notGhost)
    .map((r) => r.dataset.k ?? '')
    .filter(Boolean);
}

// Resolves with the row once it is in the current view, or null after the timeout.
export function whenRow(id: string, timeout = 1500): Promise<HTMLElement | null> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const look = () => {
      const r = rowOf(id);
      if (r) resolve(r);
      else if (performance.now() - t0 > timeout) resolve(null);
      else requestAnimationFrame(look);
    };
    look();
  });
}

// A row's node height inside it: --pt + --lh / 2 (19.5 for a row).
export function nodeOff(el: Element): number {
  const cs = getComputedStyle(el);
  const v = parseFloat(cs.getPropertyValue('--pt')) + parseFloat(cs.getPropertyValue('--lh')) / 2;
  return Number.isFinite(v) ? v : 19;
}
