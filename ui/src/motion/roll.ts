import { C } from './curves.ts';
import { reduced } from './reduced.ts';

type Rolling = HTMLElement & { _tok?: number };

// The digits of `to` that differ from `from`, after the shared head: what rolls.
export function rollSplit(from: string, to: string): { head: string; out: string; in: string } {
  const w = Math.max(from.length, to.length);
  const o = from.padStart(w, ' ');
  const v = to.padStart(w, ' ');
  let i = 0;
  while (i < w && o[i] === v[i]) i++;
  return { head: v.slice(0, i).trim(), out: o.slice(i), in: v.slice(i) };
}

// Counts roll: only the digits that change, up when the number grows; the true value sits in
// data-v of the .nv inside n (mock:1143-1162, MOTION §3.13).
export function rollTo(n: HTMLElement, value: number | string): void {
  const cur = n.querySelector<HTMLElement>('.nv') as Rolling | null;
  if (!cur) return;
  const old = String(cur.dataset.v ?? cur.textContent);
  const nw = String(value);
  if (old === nw) return;
  cur.dataset.v = nw;
  cur._tok = (cur._tok ?? 0) + 1;
  const token = cur._tok;
  for (const a of cur.getAnimations({ subtree: true })) a.cancel();
  if (reduced() || !n.isConnected) {
    cur.textContent = nw;
    if (n.isConnected)
      cur.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: C.drift });
    return;
  }
  const up = Number(nw) > Number(old) || Number.isNaN(Number(nw)) ? 1 : -1;
  const parts = rollSplit(old, nw);
  cur.textContent = parts.head;
  const rl = document.createElement('span');
  rl.className = 'rl';
  rl.style.cssText = 'display:inline-block;position:relative';
  const inner = document.createElement('span');
  inner.textContent = parts.in;
  inner.style.display = 'inline-block';
  inner.style.whiteSpace = 'pre';
  const g = document.createElement('span');
  g.textContent = parts.out;
  g.style.cssText = 'position:absolute;left:0;top:0;white-space:pre';
  rl.append(inner, g);
  cur.append(rl);
  g.animate(
    [
      { transform: 'translateY(0)', filter: 'blur(0px)' },
      { transform: `translateY(${-100 * up}%)`, filter: 'blur(.8px)' },
    ],
    { duration: 440, easing: C.glide, fill: 'both' },
  );
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: C.drift, fill: 'both' });
  inner.animate(
    [
      { transform: `translateY(${100 * up}%)`, filter: 'blur(.8px)' },
      { transform: 'none', filter: 'blur(0px)' },
    ],
    { duration: 520, easing: C.settle },
  );
  inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: C.drift });
  setTimeout(() => {
    if (cur._tok === token) cur.textContent = nw;
  }, 560);
}
