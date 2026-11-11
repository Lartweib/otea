import { useEffect, useRef } from 'react';

// Escape closes the topmost thing open (mock:4323-4334), in this order: a dialog, a pop, the link
// form, the notes form, the drawer, Ampliar, the intake, the detail. Each surface registers while
// it is open; the highest layer, then the latest of a layer, takes the key.
export type EscapeLayer =
  | 'dialog'
  | 'pop'
  | 'link'
  | 'notes'
  | 'drawer'
  | 'full'
  | 'intake'
  | 'detail';

const RANK: Record<EscapeLayer, number> = {
  dialog: 8,
  pop: 7,
  link: 6,
  notes: 5,
  drawer: 4,
  full: 3,
  intake: 2,
  detail: 1,
};

type Entry = { layer: EscapeLayer; fn: () => void; seq: number };

const stack: Entry[] = [];
let seq = 0;
let listening = false;

// The entry that takes the key: the highest layer, the latest of it.
export function topEscape(entries: readonly Entry[] = stack): Entry | undefined {
  let top: Entry | undefined;
  for (const e of entries) {
    if (
      !top ||
      RANK[e.layer] > RANK[top.layer] ||
      (RANK[e.layer] === RANK[top.layer] && e.seq > top.seq)
    ) {
      top = e;
    }
  }
  return top;
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = topEscape();
  if (!top) return;
  event.preventDefault();
  top.fn();
}

export function pushEscape(layer: EscapeLayer, fn: () => void): () => void {
  const entry = { layer, fn, seq: ++seq };
  stack.push(entry);
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKey);
    listening = true;
  }
  return () => {
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
  };
}

// Registers fn on its layer while active.
export function useEscape(active: boolean, layer: EscapeLayer, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    return pushEscape(layer, () => ref.current());
  }, [active, layer]);
}
