import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { fetchItem } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { type SplitKind, splitKindOf, splitOf, storedWidth, WIDTH_KEYS } from '../../app/widths.ts';
import { useWorkspace, workspace } from '../../app/workspace.ts';
import { NewItemForm } from '../../components/NewItemForm.tsx';
import { t } from '../../i18n/i18n.ts';
import { useEscape } from '../../kit/escape.ts';
import { curView, listOrder, redrawLists, rowOf } from '../../lanes/dom.ts';
import { motionBus } from '../../motion/bus.ts';
import { Choreo, leaveTogether, mirrorDelays, type Part, part } from '../../motion/choreo.ts';
import { C, F, lerp } from '../../motion/curves.ts';
import { drive } from '../../motion/drive.ts';
import { reduced } from '../../motion/reduced.ts';
import { relayoutList } from '../../motion/relayout.ts';
import { T, Tt } from '../../motion/time.ts';
import type { ItemView } from '../../types.ts';
import { AgentSheet } from '../agent/AgentSheet.tsx';
import { dividerBounds, dividerKey, intakeTarget, sheetItem } from './frame.ts';
import { ItemMissing } from './ItemMissing.tsx';
import { ItemSheet } from './ItemSheet.tsx';
import { Pen } from './pen.ts';
import { drawRoute, undrawRoute } from './Route.tsx';

// The item beside the list (SPEC §10.2, mock:2770-3255): the sheet takes all the room right of the
// divider; opening, closing and swapping are one gesture each, mirrored and reversible from where
// they are; the pen draws from the row into the headline. On the phone the item is a pushed page.

const INTAKE = '\u0000intake';
// An agent's sheet (agents mock §3) shows here too, keyed by its name after this mark.
const AGENT = '\u0000agent:';
const agentOf = (target: string | null) =>
  target?.startsWith(AGENT) ? target.slice(AGENT.length) : null;
// The row the pen draws from: an item's; neither the intake nor an agent has one.
const rowIdOf = (target: string | null) =>
  target === INTAKE || agentOf(target) !== null ? null : target;

// The items opened so far, so reopening or swapping back never waits for the server.
const cache = new Map<string, ItemView | null>();

function useItemView(id: string | null, version: number): ItemView | null | undefined {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version means the item changed
  useEffect(() => {
    if (!id) return;
    const ctl = new AbortController();
    fetchItem(id, ctl.signal).then(
      (v) => {
        cache.set(id, v);
        bump();
      },
      () => undefined,
    );
    return () => ctl.abort();
  }, [id, version]);
  return id ? cache.get(id) : undefined;
}

type Kind = SplitKind;

const root = () => document.documentElement;
const mainEl = () => document.querySelector<HTMLElement>('.main');
const listw = () => parseFloat(getComputedStyle(root()).getPropertyValue('--listw')) || 520;

function placeSplit(kind: Kind): number {
  const main = mainEl();
  if (!main) return listw();
  const { listw: w, overlay } = splitOf(main.clientWidth, kind, storedWidth(kind));
  root().style.setProperty('--listw', `${w}px`);
  // A page that cannot keep its width beside the sheet stays whole under it (frame.css, sheet.css).
  main.toggleAttribute('data-overlay', overlay);
  return w;
}

// The list compacts beside the sheet, or widens back, as one FLIP (mock:2890-2933).
function narrowList(on: boolean, kind: Kind): void {
  const view = curView();
  const apply = () => {
    if (on) placeSplit(kind);
    else mainEl()?.removeAttribute('data-overlay');
    view?.classList.toggle('narrow', on);
    view?.classList.toggle('chead', on);
  };
  if (view) relayoutList(view, on, apply);
  else apply();
  workspace.set({ narrow: on });
}

// Closing beside the list, the sheet, its divider and the pen leave together within one fade; only
// then does the list widen (sweep #6), so no row slides under a sheet that still shows.
const LEAVE = T.fade;

// The open gesture's parts (mock:2936-2947): the divider draws down, the sheet fades and slides,
// its content resolves. On the phone the close is the same parts mirrored; beside the list they
// leave together (LEAVE). The frame and the content are two Choreos sharing one mirror, so the
// content can be swapped without touching the frame.
function openParts(sheet: HTMLElement, divider: HTMLElement | null, phone: boolean) {
  const content = [...sheet.querySelectorAll(':scope > .sheet-in:not(.sheet-old) [data-c]')];
  if (phone) {
    const v = curView();
    const frame: Part[] = [
      part(
        sheet,
        { transform: 'translateX(100%)' },
        { transform: 'translateX(0%)' },
        560,
        'settle',
        0,
      ),
      part(v, { transform: 'translateX(0%)' }, { transform: 'translateX(-24%)' }, 560, 'settle', 0),
      part(sheet, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
    ];
    const inner = content
      .slice(0, 6)
      .map((c, i) => part(c, { opacity: 0 }, { opacity: 1 }, 420, 'drift', 120 + 30 * i));
    mirrorDelays([...frame, ...inner]);
    return { frame, inner };
  }
  const dl = divider?.querySelector<HTMLElement>('.dl') ?? null;
  if (dl) dl.style.transformOrigin = '0 0';
  const h = Math.min(400, mainEl()?.clientHeight ?? 400);
  const frame: Part[] = [
    part(dl, { transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }, Tt.line(h) + 80, 'ink', 40),
    part(sheet, { opacity: 0 }, { opacity: 1 }, 360, 'drift', 60),
    part(
      sheet,
      { transform: 'translateX(28px)' },
      { transform: 'translateX(0px)' },
      600,
      'settle',
      60,
    ),
  ];
  const inner = content.flatMap((c, i) => [
    part(c, { opacity: 0 }, { opacity: 1 }, 420, 'drift', 100 + 30 * i),
    part(
      c,
      { transform: 'translateY(8px)' },
      { transform: 'translateY(0px)' },
      480,
      'glide',
      100 + 30 * i,
    ),
  ]);
  leaveTogether([...frame, ...inner], LEAVE);
  mirrorDelays([...frame, ...inner]);
  return { frame, inner };
}

// Route identity without the open item: a change means another view.
const viewKeyOf = (route: ReturnType<typeof useApp>['route']) => {
  const { item: _item, ...view } = route;
  return JSON.stringify(view);
};

type Pending =
  | { kind: 'open' }
  | {
      kind: 'swap';
      old: HTMLElement;
      dir: 1 | -1;
      y0Old: number | null;
      st0: number;
      oldBand: HTMLElement | null;
      oldTop: number | null;
    };

type Host = { moveSplit(): void };
let host: Host | null = null;

// The divider moved because the view changed (Lista ⇄ Tabla): the sheet and the divider slide to
// their new edge, already laid out (mock:3065-3073).
export function moveSplit(): void {
  host?.moveSplit();
}

export function DetailHost() {
  const app = useApp();
  const ws = useWorkspace();
  const phone = app.phone;
  const want = app.route.item ?? null;
  const item = useItemView(want, app.version);
  // After Crear: the created id, until the place opens it (or anything else).
  const [created, setCreated] = useState<string | null>(null);
  const placed = intakeTarget(!!ws.intake, want, created);
  const target = placed === 'intake' ? INTAKE : ws.agent && !want ? `${AGENT}${ws.agent}` : placed;
  const lastIntake = useRef(ws.intake);
  if (ws.intake) lastIntake.current = ws.intake;
  // The place moved on (to the created item, or anywhere): the sheet follows it again.
  const wantAtCreate = useRef(want);
  useEffect(() => {
    if (created && want !== wantAtCreate.current) setCreated(null);
  }, [created, want]);
  const ready =
    target === INTAKE || agentOf(target) !== null || (target != null && item !== undefined);
  const [shown, setShown] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<SVGSVGElement>(null);
  const S = useRef({
    phase: null as null | 'open' | 'closing',
    frame: null as Choreo | null,
    inner: null as Choreo | null,
    pending: null as Pending | null,
    last: null as ItemView | null,
    viewKey: viewKeyOf(app.route),
    full: false,
    pen: null as Pen | null,
    // Whether the list is laid out beside the sheet, and the widening that waits for the sheet.
    narrow: false,
    widen: 0,
  });
  const st = S.current;
  st.last = sheetItem(st.last, want, item);
  // What sits left of the sheet sizes the split: a board by how it lists, any other view as a page.
  const kind = splitKindOf(app.route.view, ws.listKind);
  const kindRef = useRef(kind);
  kindRef.current = kind;

  const pen = () => {
    if (!st.pen && linkRef.current)
      st.pen = new Pen(linkRef.current, mainEl, () => sheetRef.current);
    return st.pen;
  };

  const buildChoreo = (frameToo: boolean) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const { frame, inner } = openParts(sheet, dividerRef.current, phone);
    if (frameToo) st.frame = new Choreo(frame);
    st.inner = new Choreo(inner);
  };

  // The list beside the sheet, or back to the whole room: once per change, never twice.
  const setNarrow = (on: boolean, force = false) => {
    window.clearTimeout(st.widen);
    st.widen = 0;
    if (st.narrow === on && !force) return;
    st.narrow = on;
    narrowList(on, kindRef.current);
  };

  const open = () => {
    st.phase = 'open';
    if (!phone) setNarrow(true, true);
    buildChoreo(true);
    void st.frame?.go(1);
    void st.inner?.go(1);
    drawRoute(sheetRef.current?.querySelector('.route-wrap') ?? null);
    const p = pen();
    if (p && !phone) {
      p.id = rowIdOf(target);
      p.u = 0;
      p.to(1, 140);
    }
  };

  const finish = () => {
    st.phase = null;
    st.pen?.stop();
    // The pen lives on the link of this sheet: the next sheet draws a new one.
    st.pen = null;
    st.frame?.cancel();
    st.inner?.cancel();
    st.frame = st.inner = null;
    const v = curView();
    if (v && phone) {
      v.style.transform = '';
      for (const a of v.getAnimations()) a.cancel();
    }
    workspace.set({ full: false });
    setShown(null);
    redrawLists();
  };

  const close = () => {
    st.phase = 'closing';
    const sheet = sheetRef.current;
    undrawRoute(sheet?.querySelector('.route-wrap') ?? null, phone);
    if (!phone) {
      // The pen leaves on the sheet's clock; the list widens once both are gone.
      st.pen?.to(0, 0, LEAVE);
      window.clearTimeout(st.widen);
      st.widen = window.setTimeout(() => setNarrow(false), reduced() ? T.reduced : LEAVE);
    }
    const frame = st.frame;
    void st.inner?.go(0);
    void frame?.go(0).then((latest) => {
      if (latest && st.phase === 'closing' && st.frame === frame) finish();
    });
    if (!frame) finish();
  };

  const reopen = () => {
    st.phase = 'open';
    const wrap = sheetRef.current?.querySelector('.route-wrap');
    for (const l of wrap?.querySelectorAll('svg *') ?? [])
      for (const a of l.getAnimations()) a.cancel();
    drawRoute(wrap ?? null, 0);
    if (!phone) {
      setNarrow(true);
      const p = pen();
      if (p) {
        p.id = rowIdOf(target);
        p.to(1, 0);
      }
    }
    void st.frame?.go(1);
    void st.inner?.go(1);
  };

  // The view changed under the sheet: it dissolves with the old view (mock:2999-3008).
  const drop = () => {
    st.phase = 'closing';
    st.pen?.stop();
    const els = [sheetRef.current, dividerRef.current, linkRef.current].filter(
      Boolean,
    ) as Element[];
    const R = reduced();
    let left = els.length;
    for (const e of els) {
      for (const a of e.getAnimations()) a.cancel();
      e.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: R ? 160 : 240,
        easing: C.drift,
        fill: 'forwards',
      }).finished.then(
        () => {
          if (--left === 0 && st.phase === 'closing') finish();
        },
        () => undefined,
      );
    }
    if (!els.length) finish();
    setNarrow(false, true);
  };

  const prepareSwap = (from: string): Pending | null => {
    const sheet = sheetRef.current;
    const sIn = sheet?.querySelector<HTMLElement>(':scope > .sheet-in:not(.sheet-old)');
    if (!sheet || !sIn) return null;
    const old = sIn.cloneNode(true) as HTMLElement;
    old.classList.add('sheet-old');
    old.setAttribute('aria-hidden', 'true');
    old.setAttribute('inert', '');
    old.style.cssText = `position:absolute;left:0;right:0;top:${sIn.offsetTop - sheet.scrollTop}px;pointer-events:none;margin:0`;
    const order = listOrder();
    const to = target ?? '';
    const dir = order.indexOf(to) >= order.indexOf(from) ? 1 : -1;
    const oldRow = rowOf(from);
    return {
      kind: 'swap',
      old,
      dir,
      y0Old: st.pen?.y0Now() ?? null,
      st0: sheet.scrollTop,
      oldBand: oldRow?.querySelector<HTMLElement>('.band') ?? null,
      oldTop: oldRow?.getBoundingClientRect().top ?? null,
    };
  };

  const runSwap = (p: Extract<Pending, { kind: 'swap' }>) => {
    const sheet = sheetRef.current;
    const sIn = sheet?.querySelector<HTMLElement>(':scope > .sheet-in:not(.sheet-old)');
    if (!sheet || !sIn) return;
    const R = reduced();
    const id = rowIdOf(target);
    const newRow = id ? rowOf(id) : null;
    // One band travels to the newly picked row.
    const nb = newRow?.querySelector<HTMLElement>('.band') ?? null;
    for (const b of [p.oldBand, nb])
      for (const a of b?.getAnimations() ?? []) if (a instanceof CSSTransition) a.finish();
    if (nb && p.oldTop != null && !R && newRow) {
      const dy = p.oldTop - newRow.getBoundingClientRect().top;
      if (Math.abs(dy) > 1)
        nb.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
          duration: Tt.travel(dy),
          easing: C.settle,
        });
    }
    sheet.appendChild(p.old);
    buildChoreo(false);
    if (R) {
      p.old
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 160,
          easing: C.drift,
          fill: 'forwards',
        })
        .finished.then(
          () => p.old.remove(),
          () => p.old.remove(),
        );
      sheet.scrollTop = 0;
      if (st.pen) {
        st.pen.id = id;
        st.pen.draw();
      }
      return;
    }
    sheet.scrollTop = p.st0;
    p.old.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180,
      easing: C.drift,
      fill: 'forwards',
    });
    p.old
      .animate([{ transform: 'none' }, { transform: `translateY(${-6 * p.dir}px)` }], {
        duration: 260,
        easing: C.glide,
        fill: 'forwards',
      })
      .finished.then(
        () => p.old.remove(),
        () => p.old.remove(),
      );
    sIn.animate(
      [
        { opacity: 0, transform: `translateY(${8 * p.dir}px)`, filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 420, delay: 90, easing: C.glide, fill: 'backwards' },
    );
    drawRoute(sIn.querySelector('.route-wrap'), 120);
    if (p.st0 > 0) {
      const t0 = p.st0;
      drive(440, (k) => {
        if (sheetRef.current) sheetRef.current.scrollTop = t0 * (1 - F.settle(k));
      });
    }
    const v = curView();
    if (newRow && v && !phone) {
      const vr = v.getBoundingClientRect();
      const rr = newRow.getBoundingClientRect();
      if (rr.top < vr.top + 40 || rr.bottom > vr.bottom - 40)
        v.scrollTo({ top: v.scrollTop + rr.top - vr.top - vr.height / 3, behavior: 'smooth' });
    }
    const pn = pen();
    if (pn && !phone) {
      const had = pn.id;
      pn.id = id;
      if (!id) pn.to(0, 0);
      else if (!had) {
        pn.u = 0;
        pn.to(1, 60);
      } else pn.glide(p.y0Old);
    }
  };

  // The gesture state machine: it runs after every commit.
  useLayoutEffect(() => {
    const p = st.pending;
    st.pending = null;
    if (p?.kind === 'open') open();
    else if (p?.kind === 'swap') runSwap(p);
    const vk = viewKeyOf(app.route);
    const viewChanged = vk !== st.viewKey;
    st.viewKey = vk;
    if (target && ready) {
      if (shown == null) {
        st.pending = { kind: 'open' };
        setShown(target);
        return;
      }
      if (shown !== target) {
        if (st.phase === 'closing') {
          setShown(target);
          reopen();
          return;
        }
        st.pending = prepareSwap(shown);
        setShown(target);
        return;
      }
      if (st.phase === 'closing') reopen();
      return;
    }
    if (!target && shown != null && st.phase === 'open') {
      if (viewChanged) drop();
      else close();
    }
  });

  // Ampliar / Reducir (mock:3076-3106): the sheet takes the room, already laid out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when Ampliar toggles
  useLayoutEffect(() => {
    const on = ws.full;
    if (st.full === on) return;
    st.full = on;
    const sheet = sheetRef.current;
    const divider = dividerRef.current;
    const sIn = sheet?.querySelector<HTMLElement>(':scope > .sheet-in:not(.sheet-old)');
    if (!sheet || !divider || !sIn || phone) return;
    const lw = listw() + 9;
    const v = curView();
    const pn = pen();
    for (const a of sheet.getAnimations()) a.cancel();
    for (const a of sIn.getAnimations()) if (a.id === 'amp') a.cancel();
    if (reduced()) {
      divider.style.opacity = on ? '0' : '';
      sheet.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 160, easing: C.drift });
      if (pn) {
        pn.off = on;
        pn.u = on ? 0 : 1;
        pn.draw();
      }
      return;
    }
    if (on) {
      if (pn) {
        pn.to(0, 0, 360);
        window.setTimeout(() => {
          if (workspace.get().full) pn.off = true;
        }, 380);
      }
      sheet.animate(
        [{ clipPath: `inset(0px 0px 0px ${lw}px)` }, { clipPath: 'inset(0px 0px 0px 0px)' }],
        {
          duration: 600,
          delay: 60,
          easing: C.settle,
          fill: 'backwards',
        },
      );
      const a2 = sIn.animate([{ transform: `translateX(${lw}px)` }, { transform: 'none' }], {
        duration: 600,
        delay: 60,
        easing: C.settle,
        fill: 'backwards',
      });
      a2.id = 'amp';
      divider.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translateX(${-lw}px)`, opacity: 1, offset: 0.7 },
          { transform: `translateX(${-lw}px)`, opacity: 0 },
        ],
        { duration: 660, delay: 60, easing: C.settle, fill: 'forwards' },
      );
      if (v)
        v.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 360,
          delay: 60,
          easing: C.drift,
          fill: 'forwards',
        }).id = 'dim';
    } else {
      const cover = document.createElement('div');
      cover.className = 'cover';
      cover.style.width = `${lw}px`;
      mainEl()?.appendChild(cover);
      cover
        .animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
          duration: 600,
          easing: C.settle,
          fill: 'forwards',
        })
        .finished.then(
          () => cover.remove(),
          () => cover.remove(),
        );
      const a2 = sIn.animate([{ transform: `translateX(${-lw}px)` }, { transform: 'none' }], {
        duration: 600,
        easing: C.settle,
      });
      a2.id = 'amp';
      for (const a of divider.getAnimations()) a.cancel();
      divider.animate(
        [
          { transform: `translateX(${-lw}px)`, opacity: 0 },
          { transform: `translateX(${-lw}px)`, opacity: 1, offset: 0.1 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 600, easing: C.settle },
      );
      if (v) {
        for (const a of v.getAnimations()) if (a.id === 'dim') a.cancel();
        v.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 360,
          delay: 120,
          easing: C.drift,
          fill: 'backwards',
        });
      }
      if (pn) {
        pn.off = false;
        pn.u = 0;
        pn.draw();
        window.setTimeout(() => {
          if (!workspace.get().full && st.phase === 'open') pn.to(1, 0, 360);
        }, 300);
      }
    }
  }, [ws.full]);

  // The width follows the room; the pen follows whatever moves the row.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listeners for as long as the sheet is up
  useEffect(() => {
    if (shown == null || phone) return;
    const main = mainEl();
    if (!main) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (st.phase === 'open') placeSplit(kindRef.current);
        redrawLists();
        st.pen?.draw();
      });
    };
    const onScroll = () => st.pen?.draw();
    const mo = new MutationObserver((records) => {
      if (
        records.some(
          (r) => !(r.target as Element).closest?.('.sheet, .link, .divider, .fxl, .cover'),
        )
      )
        st.pen?.followFor(900);
    });
    mo.observe(main, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    main.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    const offHalf = motionBus.onHalf(() => st.pen?.followFor(900));
    return () => {
      mo.disconnect();
      main.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      offHalf();
      cancelAnimationFrame(raf);
    };
  }, [shown == null, phone]);

  // moveSplit, for the boards' morph; and on its own when what the view lists changes.
  host = {
    moveSplit() {
      const sheet = sheetRef.current;
      const divider = dividerRef.current;
      if (!sheet || st.phase !== 'open' || phone) return;
      const a = sheet.getBoundingClientRect().left;
      placeSplit(kindRef.current);
      const b = sheet.getBoundingClientRect().left;
      redrawLists();
      if (Math.abs(a - b) < 1 || reduced()) {
        st.pen?.draw();
        return;
      }
      for (const e of [sheet, divider])
        e?.animate([{ transform: `translateX(${a - b}px)` }, { transform: 'none' }], {
          duration: 560,
          easing: C.settle,
        });
      drive(600, () => st.pen?.draw());
    },
  };
  useEffect(
    () => () => {
      host = null;
    },
    [],
  );
  const lastKind = useRef(kind);
  useLayoutEffect(() => {
    if (lastKind.current === kind) return;
    lastKind.current = kind;
    host?.moveSplit();
  }, [kind]);

  const agentShown = agentOf(shown);
  useEscape(shown != null && shown !== INTAKE && !ws.intake && !ws.full, 'detail', () =>
    agentShown !== null ? app.closeAgent() : app.closeItem(),
  );
  useEscape(ws.full && shown != null, 'full', () => workspace.set({ full: false }));
  useEscape(!!ws.intake, 'intake', () => workspace.set({ intake: null }));

  // The divider: drag, keys, double-click home, remembered by what the view lists (mock:3220-3255).
  const setW = (w: number, persist = true) => {
    const main = mainEl();
    const d = dividerRef.current;
    if (!main) return;
    const [lo, hi] = dividerBounds(main.clientWidth, kindRef.current);
    const v = Math.round(Math.min(hi, Math.max(lo, w)));
    if (persist) {
      try {
        localStorage.setItem(WIDTH_KEYS[kindRef.current], String(v));
      } catch {
        // kept for this page only
      }
    }
    root().style.setProperty('--listw', `${v}px`);
    d?.setAttribute('aria-valuemin', String(lo));
    d?.setAttribute('aria-valuemax', String(hi));
    d?.setAttribute('aria-valuenow', String(v));
    redrawLists();
    st.pen?.draw();
  };
  const home = () => {
    try {
      localStorage.removeItem(WIDTH_KEYS[kindRef.current]);
    } catch {
      // nothing stored
    }
    const a = listw();
    const b = splitOf(mainEl()?.clientWidth ?? 0, kindRef.current, null).listw;
    if (reduced()) setW(b, false);
    else drive(200, (k) => setW(lerp(a, b, F.settle(k)), false));
  };

  if (shown == null) return null;
  const main = typeof document === 'undefined' ? null : mainEl();
  const [lo, hi] = dividerBounds(main?.clientWidth ?? 1200, kind);
  const content = shown === INTAKE ? null : st.last;
  const order = shown === INTAKE || agentShown !== null ? [] : listOrder();
  const at = order.indexOf(shown);
  const nav = { prev: at > 0, next: at >= 0 && at < order.length - 1 };
  const goNav = (dir: -1 | 1) => {
    const o = listOrder();
    let i = o.indexOf(shown);
    if (i < 0) i = dir > 0 ? -1 : o.length;
    const k = o[i + dir];
    if (k) app.openItem(k);
  };
  const intake = ws.intake ?? lastIntake.current;
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a separator that holds its grip and takes the keys */}
      <div
        ref={dividerRef}
        className="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label={t(kind === 'table' ? 'sheet.dividerTable' : 'sheet.divider')}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={Math.round(listw())}
        tabIndex={0}
        hidden={phone}
        onPointerDown={(e) => {
          if (ws.full) return;
          e.preventDefault();
          const d = e.currentTarget;
          d.setPointerCapture(e.pointerId);
          d.classList.add('drag');
          const x0 = e.clientX;
          const w0 = listw();
          const mv = (ev: PointerEvent) => setW(w0 + ev.clientX - x0);
          const up = () => {
            d.classList.remove('drag');
            d.removeEventListener('pointermove', mv);
            d.removeEventListener('pointerup', up);
            d.removeEventListener('pointercancel', up);
          };
          d.addEventListener('pointermove', mv);
          d.addEventListener('pointerup', up);
          d.addEventListener('pointercancel', up);
        }}
        onDoubleClick={home}
        onKeyDown={(e) => {
          const r = dividerKey(
            e.key,
            e.shiftKey,
            listw(),
            dividerBounds(mainEl()?.clientWidth ?? 0, kindRef.current),
          );
          if (!r) return;
          e.preventDefault();
          if (r === 'home') home();
          else setW(r.w);
        }}
      >
        <i className="dl" />
        <i className="grip" />
      </div>
      <article
        ref={sheetRef}
        className={ws.full ? 'sheet full' : 'sheet'}
        aria-label={t('sheet.label')}
      >
        <div className="sheet-in" key={shown}>
          {shown === INTAKE && intake ? (
            <div className="d-grid">
              <div data-c>
                <NewItemForm
                  key={intake.parent?.id ?? intake.board ?? 'new'}
                  {...(intake.board ? { board: intake.board } : {})}
                  {...(intake.parent ? { parent: intake.parent } : {})}
                  onCancel={() => workspace.set({ intake: null })}
                  onCreated={(id) => {
                    wantAtCreate.current = want;
                    setCreated(id);
                    app.openItem(id);
                  }}
                />
              </div>
            </div>
          ) : agentShown !== null ? (
            <div data-c>
              <AgentSheet name={agentShown} onClose={app.closeAgent} />
            </div>
          ) : content ? (
            <ItemSheet
              key={content.id}
              item={content}
              full={ws.full}
              nav={nav}
              onNav={goNav}
              onFull={() => workspace.set({ full: !ws.full })}
              onClose={app.closeItem}
            />
          ) : (
            <ItemMissing id={shown} phone={phone} onClose={app.closeItem} />
          )}
        </div>
      </article>
      <svg ref={linkRef} className="link" aria-hidden="true" />
    </>
  );
}
