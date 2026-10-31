// The workspace split: how wide the list is next to the detail, and whether the collections sidebar
// is shown. Both are remembered per browser; a browser that refuses storage starts from the
// defaults.

export const LIST_WIDTH = { min: 340, max: 783, initial: 520 } as const;

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

export function readListWidth(storage: SplitStorage | undefined): number {
  const raw = read(storage, LIST_WIDTH_KEY);
  const width = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(width) ? clampListWidth(width) : LIST_WIDTH.initial;
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

// The width a key on the focused divider asks for, or undefined for a key it does not use.
export function dividerKeyWidth(
  key: string,
  shift: boolean,
  width: number,
  max: number,
): number | undefined {
  const step = shift ? DIVIDER_STEP.large : DIVIDER_STEP.small;
  switch (key) {
    case 'ArrowLeft':
      return clampListWidth(width - step, max);
    case 'ArrowRight':
      return clampListWidth(width + step, max);
    case 'Home':
      return LIST_WIDTH.min;
    case 'End':
      return clampListWidth(LIST_WIDTH.max, max);
    default:
      return undefined;
  }
}
