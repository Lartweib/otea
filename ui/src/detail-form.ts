// The detail's form: one column (stacked), or, on a wide enough pane, a main column and an aside
// beside it that holds History, under a band where Details sits beside the header. Geometry shared
// with detail.css, which computes the same widths from the pane (container units).

export const ASIDE = { gutter: 40, main: 800, gap: 48, min: 340, max: 440 } as const;

// The detail pane width (gutters included) from which the aside shows: 40 + 800 + 48 + 340 + 40.
export const ASIDE_FROM = ASIDE.gutter + ASIDE.main + ASIDE.gap + ASIDE.min + ASIDE.gutter;

export type DetailForm = 'stacked' | 'aside';

export type Composition = { form: DetailForm; main: number; aside?: number };

// The detail fills its pane, whatever the screen: the column between the two gutters is all main
// when stacked; beside an aside, the aside takes a quarter of every pixel past the threshold (340 to
// 440) and main the rest, uncapped. Prose keeps its own 72ch measure inside main.
export function composition(paneWidth: number): Composition {
  const column = paneWidth - 2 * ASIDE.gutter;
  if (paneWidth < ASIDE_FROM) return { form: 'stacked', main: column };
  const grown = Math.round(ASIDE.min + (paneWidth - ASIDE_FROM) / 4);
  const aside = Math.max(ASIDE.min, Math.min(ASIDE.max, grown));
  return { form: 'aside', main: column - ASIDE.gap - aside, aside };
}

export function detailForm(paneWidth: number): DetailForm {
  return composition(paneWidth).form;
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
