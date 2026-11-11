// A bottom sheet under the finger (SPEC §10.7, mock:3597-3604), as pure functions of where the
// finger is: the sheet follows it down one to one and resists upward (×0.35); a sheet taller than
// the screen scrolls its content first and only then moves; on release it goes past 30% of its
// height or on a flick over .5 px/ms, and otherwise settles back.

export const DRAG = { resist: 0.35, dismiss: 0.3, flick: 0.5, slop: 6 } as const;

export type Scroller = { scroll: number; max: number };

export type DragState = {
  y0: number;
  // the sheet's translateY and its content's scrollTop when the finger caught it
  base: number;
  s0: number;
  max: number;
  last: number;
  lt: number;
  v: number;
  moved: boolean;
};

export type DragFrame = { y: number; scroll: number; v: number; state: DragState };

export function dragStart(
  y: number,
  t: number,
  scroller: Scroller | null,
  base: number,
): DragState {
  return {
    y0: y,
    base,
    s0: scroller?.scroll ?? 0,
    max: Math.max(0, scroller?.max ?? 0),
    last: base,
    lt: t,
    v: 0,
    moved: false,
  };
}

export function dragFrame(s: DragState, y: number, t: number): DragFrame {
  const raw = y - s.y0;
  // One coordinate for both: above 0 the sheet moves down, below 0 the content scrolls, and past
  // the end of the content the sheet rises with resistance.
  const c = s.base - s.s0 + raw;
  let sheet = 0;
  let scroll = 0;
  if (c >= 0) sheet = c;
  else {
    scroll = Math.min(s.max, -c);
    const rest = -c - scroll;
    sheet = rest ? -rest * DRAG.resist : 0;
  }
  const v = (sheet - s.last) / Math.max(1, t - s.lt);
  const moved = s.moved || Math.abs(raw) > DRAG.slop;
  return { y: sheet, scroll, v, state: { ...s, last: sheet, lt: t, v, moved } };
}

export function release(y: number, v: number, H: number): 'dismiss' | 'back' {
  return y > 0 && (y > H * DRAG.dismiss || v > DRAG.flick) ? 'dismiss' : 'back';
}
