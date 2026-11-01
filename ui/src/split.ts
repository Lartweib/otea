// The workspace split: how wide the list is next to the detail, and whether the collections sidebar
// is shown. Both are remembered per browser; a browser that refuses storage starts from the
// defaults.

export const LIST_WIDTH = { min: 340, max: 783, initial: 520 } as const;

// Until the viewer sets a width, the list takes a share of the workspace, so a wide screen spreads
// its room between list and detail instead of piling it up on the right.
export const LIST_SHARE = 0.34;

export function defaultListWidth(room: number): number {
  if (!Number.isFinite(room) || room <= 0) return LIST_WIDTH.initial;
  return Math.round(Math.max(LIST_WIDTH.initial, Math.min(LIST_WIDTH.max, room * LIST_SHARE)));
}

// The detail never gets narrower than this, so the list's room is what is left of it.
export const DETAIL_MIN = 440;

export const LIST_WIDTH_KEY = 'otea.listWidth';
export const SIDEBAR_KEY = 'otea.sidebar';

// How far the arrow keys move the divider, and with Shift held.
export const DIVIDER_STEP = { small: 16, large: 64 } as const;

// The widest the list can be when list and detail share `room` px between them.
export function listMax(room: number): number {
  return Math.max(LIST_WIDTH.min, Math.min(LIST_WIDTH.max, Math.floor(room - DETAIL_MIN)));
}

export function clampListWidth(width: number, max: number = LIST_WIDTH.max): number {
  if (!Number.isFinite(width)) return LIST_WIDTH.initial;
  const top = Math.max(LIST_WIDTH.min, Math.min(LIST_WIDTH.max, max));
  return Math.round(Math.max(LIST_WIDTH.min, Math.min(top, width)));
}

export type SplitStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

function read(storage: SplitStorage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: SplitStorage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // It still applies in this tab; it just will not be remembered.
  }
}

// The width the viewer set, or undefined while they have not set one (the list takes its share).
export function readListWidth(storage: SplitStorage | undefined): number | undefined {
  const raw = read(storage, LIST_WIDTH_KEY);
  const width = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(width) ? clampListWidth(width) : undefined;
}

// Back to the default: the viewer's width is forgotten.
export function forgetListWidth(storage: SplitStorage | undefined): void {
  try {
    storage?.removeItem?.(LIST_WIDTH_KEY);
  } catch {
    // Nothing to forget in a browser that refuses storage.
  }
}

export function writeListWidth(storage: SplitStorage | undefined, width: number): void {
  write(storage, LIST_WIDTH_KEY, String(clampListWidth(width)));
}

// Shown unless this browser folded it.
export function readSidebar(storage: SplitStorage | undefined): boolean {
  return read(storage, SIDEBAR_KEY) !== 'off';
}

export function writeSidebar(storage: SplitStorage | undefined, shown: boolean): void {
  write(storage, SIDEBAR_KEY, shown ? 'on' : 'off');
}

// The limits a pane's width keeps to: the list's, or the grid's (no limit of its own past the room).
export type WidthLimits = { readonly min: number; readonly max: number };

// The width a key on the focused divider asks for, or undefined for a key it does not use.
export function dividerKeyWidth(
  key: string,
  shift: boolean,
  width: number,
  max: number,
  limits: WidthLimits = LIST_WIDTH,
): number | undefined {
  const step = shift ? DIVIDER_STEP.large : DIVIDER_STEP.small;
  const clamp = (next: number) => clampWidth(next, max, limits);
  switch (key) {
    case 'ArrowLeft':
      return clamp(width - step);
    case 'ArrowRight':
      return clamp(width + step);
    case 'Home':
      return limits.min;
    case 'End':
      return clamp(Math.min(limits.max, max));
    default:
      return undefined;
  }
}

function clampWidth(width: number, max: number, limits: WidthLimits): number {
  if (limits === LIST_WIDTH) return clampListWidth(width, max);
  return clampGridWidth(width, max);
}

// ---- the grid beside the detail ----
// The grid pane takes up to the table's own measure (1320px) and leaves the detail 520 by default;
// it may grow until the detail keeps 440. While nothing is open the grid takes the whole room.
export const GRID_WIDTH = { min: 340, max: Number.POSITIVE_INFINITY } as const;
export const GRID_CAP = 1320;
const GRID_DETAIL = 520;
const DIVIDER_W = 9;

export const GRID_WIDTH_KEY = 'otea.gridWidth';

export function gridMax(room: number): number {
  return Math.max(GRID_WIDTH.min, Math.floor(room - DIVIDER_W - DETAIL_MIN));
}

export function clampGridWidth(width: number, max: number): number {
  if (!Number.isFinite(width)) return GRID_WIDTH.min;
  return Math.round(Math.max(GRID_WIDTH.min, Math.min(max, width)));
}

export function defaultGridWidth(room: number): number {
  return clampGridWidth(Math.min(GRID_CAP, room - DIVIDER_W - GRID_DETAIL), gridMax(room));
}

// The room for the grid, the divider and the detail: the workspace past its 8px gutter and the
// sidebar's track (13.75rem and 24px of air, or folded the toggle's 44px strip and the same air;
// none under 64rem).
export function gridRoom(workspace: number, sidebar: boolean, wide: boolean): number {
  const rail = wide ? (sidebar ? 13.75 * 16 + 24 : 44 + 24) : 0;
  return Math.max(0, workspace - 8 - rail);
}

export function readGridWidth(storage: SplitStorage | undefined): number | undefined {
  const raw = read(storage, GRID_WIDTH_KEY);
  const width = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(width) ? clampGridWidth(width, Number.POSITIVE_INFINITY) : undefined;
}

export function writeGridWidth(storage: SplitStorage | undefined, width: number): void {
  write(storage, GRID_WIDTH_KEY, String(clampGridWidth(width, Number.POSITIVE_INFINITY)));
}

export function forgetGridWidth(storage: SplitStorage | undefined): void {
  try {
    storage?.removeItem?.(GRID_WIDTH_KEY);
  } catch {
    // Nothing to forget in a browser that refuses storage.
  }
}
