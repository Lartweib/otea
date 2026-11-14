import { clamp } from '../motion/curves.ts';
import type { Route } from '../selection.ts';

type ListKind = 'list' | 'table' | 'cards';
// What sits left of the sheet: a list (by how its board shows it) or a page that lists nothing.
export type SplitKind = ListKind | 'page';

// The list's width beside an open item (SPEC §6.5, mock:2772-2779): room is .main's width, stored
// what the person dragged the divider to (otea.listWidth for lists and Pasos, otea.gridWidth for
// the table). The divider is 9 px; the sheet takes all the rest, at least 440 px.
export function listWidth(room: number, kind: ListKind, stored?: number | null): number {
  const max = Math.max(340, room - 9 - 440);
  if (kind === 'table')
    return Math.round(clamp(stored || Math.min(1320, room - 9 - 520), 340, max));
  return Math.round(clamp(stored || clamp(0.34 * room, 520, 783), 340, max));
}

// A page (Configuración, Rendimiento, Studio…) is not a list that compacts beside the sheet: it
// keeps at least PAGE_MIN, and the sheet docks at the right edge, PAGE_SHEET wide when there is room
// and never under SHEET_MIN. When both cannot fit, the sheet lies over the page (OVERLAY_SHEET wide)
// and the page keeps the whole room.
export const PAGE_MIN = 960;
const PAGE_SHEET = 1040;
const SHEET_MIN = 560;
const OVERLAY_SHEET = 680;

export function pageBounds(room: number): [number, number] {
  return [PAGE_MIN, room - 9 - SHEET_MIN];
}

export function pageSplit(
  room: number,
  stored?: number | null,
): { listw: number; overlay: boolean } {
  const [lo, hi] = pageBounds(room);
  if (hi < lo)
    return { listw: Math.max(0, room - 9 - Math.min(OVERLAY_SHEET, room - 9)), overlay: true };
  return { listw: Math.round(clamp(stored || room - 9 - PAGE_SHEET, lo, hi)), overlay: false };
}

export function splitOf(
  room: number,
  kind: SplitKind,
  stored?: number | null,
): { listw: number; overlay: boolean } {
  if (kind === 'page') return pageSplit(room, stored);
  return { listw: listWidth(room, kind, stored), overlay: false };
}

// The views whose rows open an item beside them; every other view is a page.
const LISTS: ReadonlySet<Route['view']> = new Set([
  'toca',
  'atasco',
  'lan',
  'board',
  'triage',
  'projects',
]);

export function splitKindOf(view: Route['view'], listKind: ListKind): SplitKind {
  return LISTS.has(view) ? listKind : 'page';
}

export const WIDTH_KEYS = {
  list: 'otea.listWidth',
  cards: 'otea.listWidth',
  table: 'otea.gridWidth',
  page: 'otea.pageWidth',
} as const;

export function storedWidth(kind: SplitKind): number | null {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEYS[kind]));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
