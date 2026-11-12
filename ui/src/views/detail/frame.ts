import { t } from '../../i18n/i18n.ts';
import { clamp } from '../../motion/curves.ts';
import type { MoveKind } from './moves.ts';

// The detail's frame, pure: the divider's bounds and keys, the pen's path, the details' cut, the
// toast a move leaves and whether it offers Undo.

// The list keeps at least 340 px; the sheet at least 440, past the 9 px divider.
export function dividerBounds(room: number): [number, number] {
  return [340, Math.max(340, room - 9 - 440)];
}

// What a key does on the divider: a new width, or easing home (forgetting the stored width).
export function dividerKey(
  key: string,
  shift: boolean,
  w: number,
  [lo, hi]: [number, number],
): { w: number } | 'home' | null {
  const step = shift ? 64 : 16;
  if (key === 'ArrowLeft') return { w: clamp(w - step, lo, hi) };
  if (key === 'ArrowRight') return { w: clamp(w + step, lo, hi) };
  if (key === 'Home') return { w: lo };
  if (key === 'End') return { w: hi };
  if (key === 'Enter') return 'home';
  return null;
}

// The pen: from the row's band end (x0, y0) across the divider to x = xs, a 9 px rounded turn, up or
// down to the headline (y1), into the sheet to xe. Level enough, an S instead.
export function penPath(o: { x0: number; y0: number; xs: number; xe: number; y1: number }): {
  d: string;
  len: number;
} {
  const { x0, y0, xs, xe, y1 } = o;
  const r = 9;
  const sg = y1 > y0 ? 1 : -1;
  const d =
    Math.abs(y1 - y0) < 2 * r + 2
      ? `M${x0} ${y0}H${xs - 20}C${xs} ${y0} ${xs} ${y1} ${xs + 20} ${y1}H${xe}`
      : `M${x0} ${y0}H${xs - r}Q${xs} ${y0} ${xs} ${y0 + sg * r}V${y1 - sg * r}Q${xs} ${y1} ${xs + r} ${y1}H${xe}`;
  return { d, len: Math.abs(xe - x0) + Math.abs(y1 - y0) };
}

// Details shows five beside the headline, then "N more".
export const DETAILS_SHOWN = 5;
export const moreOf = (cells: number): number => Math.max(0, cells - DETAILS_SHOWN);

export const shortTitle = (title: string): string =>
  title.length > 45 ? `${title.slice(0, 44).trimEnd()}…` : title;

// The toast a move leaves: what you did and where the item goes.
export function toastOf(
  kind: MoveKind | 'answer' | 'close' | 'deliver',
  title: string,
  state: string,
): string {
  const p = { title: shortTitle(title), state };
  switch (kind) {
    case 'approve':
      return t('sheet.toast.approved', p);
    case 'own':
      return t('sheet.toast.done', p);
    case 'deliver':
      return t('bi.toast.delivered', p);
    case 'sendback':
      return t('sheet.toast.sentBack', p);
    case 'answer':
      return t('sheet.toast.answered', { title: p.title });
    case 'discard':
      return t('sheet.toast.discarded', p);
    case 'close':
      return t('sheet.toast.closed', p);
    default:
      return t('sheet.toast.moved', p);
  }
}

// The toast after Retomar (back in the queue of its step) or Reasignar (left for an agent).
export function stuckToastOf(o: { title: string; state: string; agent?: string }): string {
  const title = shortTitle(o.title);
  return o.agent
    ? t('sheet.toast.reassigned', { title, agent: o.agent })
    : t('sheet.toast.restarted', { title, state: o.state });
}

// What the sheet shows: the new item form while it is open, and after Crear until the place asks
// for the created item, so the form swaps into it rather than closing first (mock:3990-3991).
export function intakeTarget(
  intakeOpen: boolean,
  want: string | null,
  created: string | null,
): 'intake' | string | null {
  if (intakeOpen) return 'intake';
  if (created && want !== created) return 'intake';
  return want;
}
