import { redrawLists } from '../lanes/dom.ts';
import { GLOW_HOLD } from '../lanes/light.ts';
import { C } from './curves.ts';
import { flipLeaves } from './flip.ts';
import { reduced } from './reduced.ts';

// The list compacts beside the detail without a snap (mock:2890-2933, MOTION §3.5 and §5.3): every
// [data-leaf] of the view FLIPs from where it is, and a title whose measure changes leaves a tail
// (a copy under the complementary mask) that dissolves as the cut settles. mutate() applies the
// layout change: the caller toggles .narrow and .chead on the view and sets --listw. While it runs,
// the lanes' light rests, then comes back where the rows land.

type Tail = HTMLElement & { _of?: HTMLElement };

const maskOf = (el: HTMLElement, v: string) => {
  el.style.maskImage = v;
  el.style.webkitMaskImage = v;
};

const tails = new WeakMap<HTMLElement, Tail[]>();
const timers = new WeakMap<HTMLElement, number>();

const visible = (v: HTMLElement, sel: string) =>
  [...v.querySelectorAll<HTMLElement>(sel)].filter((e) => !e.closest('.mghost'));

export function relayoutList(
  view: HTMLElement,
  narrow: boolean,
  mutate: () => void,
  { delay = 0 }: { delay?: number } = {},
): void {
  const titles = visible(view, '.lanes > .row:not(.ghost) [data-title]');
  const wasCut = new Map(
    titles.map((t) => [t, t.scrollWidth > t.clientWidth + 1 ? t.clientWidth : 0]),
  );
  const old = tails.get(view) ?? [];
  const tailOp = new Map(old.map((g) => [g._of, +getComputedStyle(g).opacity]));
  for (const g of old) g.remove();
  tails.set(view, []);
  for (const t of titles) maskOf(t, '');
  if (!reduced()) GLOW_HOLD.on = true;
  const moved = flipLeaves(
    visible(view, '[data-leaf]').filter((e) => !e.closest('.ghost')),
    () => {
      mutate();
      redrawLists(view);
    },
    { delay, inDelay: narrow ? 300 : delay + 340, outT: 220 },
  );
  if (reduced()) {
    GLOW_HOLD.on = false;
    redrawLists(view);
    return;
  }
  const glows = [...view.querySelectorAll<SVGGElement>('.lanes > svg.ink .glow')];
  for (const g of glows) {
    g.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180,
      easing: C.drift,
      fill: 'forwards',
    });
  }
  clearTimeout(timers.get(view));
  timers.set(
    view,
    window.setTimeout(() => {
      GLOW_HOLD.on = false;
      redrawLists(view);
      for (const g of glows) {
        for (const a of g.getAnimations()) a.cancel();
        g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: C.drift });
      }
    }, delay + 470),
  );
  const kfOf = new Map(moved.map((m) => [m.e, m.kf]));
  const mine: Tail[] = [];
  for (const t of titles) {
    const kf = kfOf.get(t) ?? [{ transform: 'none' }, { transform: 'none' }];
    const w = narrow ? t.clientWidth : (wasCut.get(t) ?? 0);
    if (!w || (narrow && t.scrollWidth <= w + 1)) continue;
    const g = t.cloneNode(true) as Tail;
    g.classList.add('tailg');
    g.removeAttribute('data-leaf');
    g.removeAttribute('data-title');
    g.removeAttribute('data-s');
    g._of = t;
    Object.assign(g.style, {
      position: 'absolute',
      left: `${t.offsetLeft}px`,
      top: `${t.offsetTop}px`,
      width: 'auto',
      overflow: 'visible',
      whiteSpace: 'nowrap',
      margin: '0',
    });
    maskOf(g, `linear-gradient(90deg, transparent ${w - 24}px, #000 ${w}px)`);
    if (!narrow) maskOf(t, `linear-gradient(90deg, #000 ${w - 24}px, transparent ${w}px)`);
    t.parentNode?.appendChild(g);
    mine.push(g);
    g.animate(kf, { duration: 560, delay, easing: C.settle, fill: 'both' });
    const o0 = tailOp.get(t) ?? (narrow ? 1 : 0);
    g.animate(
      [
        { opacity: o0, filter: `blur(${(1 - o0).toFixed(2)}px)` },
        { opacity: narrow ? 0 : 1, filter: `blur(${narrow ? 1 : 0}px)` },
      ],
      { duration: 300, delay: narrow ? delay : delay + 40, easing: C.drift, fill: 'both' },
    );
  }
  tails.set(view, mine);
  setTimeout(() => {
    for (const g of mine) {
      if (!view.classList.contains('narrow') && g._of) maskOf(g._of, '');
      g.remove();
    }
    tails.set(
      view,
      (tails.get(view) ?? []).filter((x) => !mine.includes(x)),
    );
  }, delay + 620);
}
