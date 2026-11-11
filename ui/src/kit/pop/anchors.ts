// Where a pop sits by its trigger, 16 px clear of the viewport's sides, its height capped by what
// is left of the viewport (mock:3293-3310).

export type Place = 'below-left' | 'below-right' | 'above' | ((el: HTMLElement) => void);

export function anchorBelow(btn: Element, alignRight = false): (el: HTMLElement) => void {
  return (el) => {
    const r = btn.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    const w = el.offsetWidth;
    let left = alignRight ? r.right - w : r.left;
    left = Math.max(16, Math.min(window.innerWidth - w - 16, left));
    el.style.left = `${left}px`;
    const h = el.offsetHeight;
    const surf = el.querySelector<HTMLElement>('.psurf');
    if (surf && r.bottom + 6 + h > window.innerHeight - 12) {
      surf.style.maxHeight = `${window.innerHeight - r.bottom - 22}px`;
      surf.style.overflow = 'auto';
    }
  };
}

export function anchorAbove(btn: Element, alignLeftTo?: number): (el: HTMLElement) => void {
  return (el) => {
    const r = btn.getBoundingClientRect();
    el.style.top = `${r.top - el.offsetHeight - 8}px`;
    const left = alignLeftTo ?? r.left;
    el.style.left = `${Math.max(16, Math.min(window.innerWidth - el.offsetWidth - 16, left))}px`;
  };
}

export function placer(place: Place, anchor: Element | null): ((el: HTMLElement) => void) | null {
  if (typeof place === 'function') return place;
  if (!anchor) return null;
  if (place === 'above') return anchorAbove(anchor);
  return anchorBelow(anchor, place === 'below-right');
}
