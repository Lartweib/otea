import { clamp } from '../motion/curves.ts';

// The list's width beside an open item (SPEC §6.5, mock:2772-2779): room is .main's width, stored
// what the person dragged the divider to (otea.listWidth for lists and Pasos, otea.gridWidth for
// the table). The divider is 9 px; the sheet takes all the rest, at least 440 px.
export function listWidth(
  room: number,
  kind: 'list' | 'table' | 'cards',
  stored?: number | null,
): number {
  const max = Math.max(340, room - 9 - 440);
  if (kind === 'table')
    return Math.round(clamp(stored || Math.min(1320, room - 9 - 520), 340, max));
  return Math.round(clamp(stored || clamp(0.34 * room, 520, 783), 340, max));
}

export const WIDTH_KEYS = {
  list: 'otea.listWidth',
  cards: 'otea.listWidth',
  table: 'otea.gridWidth',
} as const;

export function storedWidth(kind: 'list' | 'table' | 'cards'): number | null {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEYS[kind]));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
