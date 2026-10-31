// The detail's form: one column (stacked), or, on a wide enough pane, a main column and an aside
// beside it that holds Details and History. Geometry shared with detail.css.

export const ASIDE = { gutter: 40, main: 800, gap: 48, min: 340, max: 380 } as const;

// The detail pane width (gutters included) from which the aside shows: 40 + 800 + 48 + 340 + 40.
export const ASIDE_FROM = ASIDE.gutter + ASIDE.main + ASIDE.gap + ASIDE.min + ASIDE.gutter;

export type DetailForm = 'stacked' | 'aside';

export function detailForm(paneWidth: number): DetailForm {
  return paneWidth >= ASIDE_FROM ? 'aside' : 'stacked';
}

// The aside is never taller than the room under its top in the pane, so a long history scrolls
// inside it and never lengthens the pane; it keeps at least 240px.
export const ASIDE_MIN_HEIGHT = 240;

export function asideHeight(paneHeight: number, asideTop: number, paddingBottom: number): number {
  return Math.max(ASIDE_MIN_HEIGHT, Math.floor(paneHeight - asideTop - paddingBottom));
}

// How Details and History travel between the forms, on one timeline of three legs: sideways to an
// x clear of the main column, vertically there, sideways to where they land, so they never cross
// the Brief or Structure. To the aside they go sideways first and rise after; back, they drop first
// and slide after. dx and dy are where a section starts relative to where it lands; clear is the
// offset at which its left edge is right of the main column (plus air). xw is the offset held while
// it travels vertically; t1 and t2 are where the vertical leg starts and ends (0..1).
export type TravelPath = { xw: number; t1: number; t2: number };

export function travelPath(dx: number, dy: number, clear: number, toAside: boolean): TravelPath {
  const xw = toAside ? Math.max(0, clear) : Math.max(dx, clear);
  const first = Math.abs(xw - dx);
  const rise = Math.abs(dy);
  const last = Math.abs(xw);
  const total = first + rise + last || 1;
  return { xw, t1: first / total, t2: (first + rise) / total };
}
