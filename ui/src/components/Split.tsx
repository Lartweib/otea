import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useMediaQuery } from '../hooks.ts';
import { MOTION, reducedMotion } from '../motion.ts';
import {
  clampGridWidth,
  clampListWidth,
  defaultGridWidth,
  defaultListWidth,
  dividerKeyWidth,
  forgetGridWidth,
  forgetListWidth,
  GRID_WIDTH,
  gridMax,
  gridRoom,
  LIST_WIDTH,
  listMax,
  readGridWidth,
  readListWidth,
  readSidebar,
  type SplitStorage,
  writeGridWidth,
  writeListWidth,
  writeSidebar,
} from '../split.ts';

// Reading window.localStorage itself can throw when site data is blocked.
export function browserStorage(): SplitStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// The panes of the workspace that move when the sidebar folds, keyed for FLIP.
const PANE = '[data-pane]';

function panesOf(workspace: HTMLElement): HTMLElement[] {
  return [...workspace.querySelectorAll<HTMLElement>(PANE)];
}

// The list pane's width next to the detail, and the collections sidebar. Folding the sidebar never
// reflows a row: the list keeps its width and slides over, and the detail takes the room. The panes
// are measured before and after and the difference is played back as a transform (FLIP).
export function useSplit() {
  const workspace = useRef<HTMLElement | null>(null);
  // The viewer's width, or undefined while the list takes its share of the room.
  const [chosen, setChosen] = useState(() => readListWidth(browserStorage()));
  const [room, setRoom] = useState(0);
  const width = chosen ?? defaultListWidth(room);

  // The workspace, measured as it resizes: the list's share follows the window until the viewer
  // sets a width (the sidebar folding does not change it).
  const attach = useCallback((element: HTMLElement | null) => {
    workspace.current = element;
    if (!element) return undefined;
    const measure = () => setRoom(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (workspace.current === element) workspace.current = null;
    };
  }, []);
  const [sidebar, setSidebar] = useState(() => readSidebar(browserStorage()));
  const before = useRef<Map<string, number> | null>(null);

  const commitWidth = useCallback((next: number) => {
    const clamped = clampListWidth(next);
    writeListWidth(browserStorage(), clamped);
    setChosen(clamped);
  }, []);

  const resetWidth = useCallback(() => {
    forgetListWidth(browserStorage());
    setChosen(undefined);
  }, []);

  const toggleSidebar = useCallback(() => {
    const root = workspace.current;
    before.current = root
      ? new Map(
          panesOf(root).map((pane) => [pane.dataset.pane ?? '', pane.getBoundingClientRect().left]),
        )
      : null;
    setSidebar((shown) => {
      writeSidebar(browserStorage(), !shown);
      return !shown;
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: it plays back each change of the sidebar
  useLayoutEffect(() => {
    const root = workspace.current;
    const lefts = before.current;
    before.current = null;
    if (!root || !lefts || reducedMotion()) return;
    for (const pane of panesOf(root)) {
      const was = lefts.get(pane.dataset.pane ?? '');
      if (was === undefined) continue;
      for (const animation of pane.getAnimations()) animation.cancel();
      const dx = was - pane.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) continue;
      pane.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], {
        duration: MOTION.slow,
        easing: MOTION.ease,
      });
    }
  }, [sidebar]);

  // The grid's own width beside the detail, kept apart from the list's (otea.gridWidth).
  const wide = useMediaQuery('(min-width: 64rem)');
  const [chosenGrid, setChosenGrid] = useState(() => readGridWidth(browserStorage()));
  const gridSpace = gridRoom(room, sidebar, wide);
  const gridWidth = clampGridWidth(chosenGrid ?? defaultGridWidth(gridSpace), gridMax(gridSpace));
  const commitGridWidth = useCallback((next: number) => {
    const clamped = clampGridWidth(next, Number.POSITIVE_INFINITY);
    writeGridWidth(browserStorage(), clamped);
    setChosenGrid(clamped);
  }, []);
  const resetGridWidth = useCallback(() => {
    forgetGridWidth(browserStorage());
    setChosenGrid(undefined);
  }, []);

  const style = { '--list-w': `${width}px` } as CSSProperties;
  return {
    workspace,
    attach,
    width,
    home: defaultListWidth(room),
    commitWidth,
    resetWidth,
    sidebar,
    toggleSidebar,
    style,
    grid: {
      room: gridSpace,
      width: gridWidth,
      home: defaultGridWidth(gridSpace),
      commit: commitGridWidth,
      reset: resetGridWidth,
    },
  };
}

// What the divider resizes: the list (340-783px) or the grid (from 340px until the detail keeps
// 440), each through its own CSS variable.
export type DividerRange = 'list' | 'grid';

const RANGES = {
  list: {
    variable: '--list-w',
    limits: LIST_WIDTH,
    label: 'Resize the list',
    max: (room: number) => listMax(room),
    clamp: (width: number, max: number) => clampListWidth(width, max),
  },
  grid: {
    variable: '--grid-w',
    limits: GRID_WIDTH,
    label: 'Resize the grid',
    // The room measured is the two panes' (list and detail); the grid's own counts the divider.
    max: (room: number) => gridMax(room + 9),
    clamp: (width: number, max: number) => clampGridWidth(width, max),
  },
} as const;

type DividerProps = {
  workspace: RefObject<HTMLElement | null>;
  width: number;
  // The default width, which a double-click or Enter eases back to.
  home: number;
  onCommit: (width: number) => void;
  onReset: () => void;
  range?: DividerRange;
};

// How wide the pane may get: the list (or grid) and the detail share their room, and the detail
// keeps 440px.
function maxOf(workspace: HTMLElement | null, range: DividerRange): number {
  const { limits, max } = RANGES[range];
  const fallback = Number.isFinite(limits.max) ? limits.max : limits.min;
  if (!workspace) return fallback;
  const list = workspace.querySelector<HTMLElement>('[data-pane="list"]');
  const detail = workspace.querySelector<HTMLElement>('[data-pane="detail"]');
  if (!list || !detail) return fallback;
  return max(list.offsetWidth + detail.offsetWidth);
}

function renderedWidth(workspace: HTMLElement | null, fallback: number): number {
  const list = workspace?.querySelector<HTMLElement>('[data-pane="list"]');
  return list ? Math.round(list.offsetWidth) : fallback;
}

// The divider between the list (or the grid) and the detail: drag it (pointer events, live layout,
// no animation), or focus it and use the arrows (Shift for bigger steps), Home and End. A
// double-click or Enter eases it back to the default width.
export function Divider({
  workspace,
  width,
  home,
  onCommit,
  onReset,
  range = 'list',
}: DividerProps) {
  const { variable, limits, label, clamp } = RANGES[range];
  const [max, setMax] = useState<number>(LIST_WIDTH.max);
  const self = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const measure = () => setMax(maxOf(root, range));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [workspace, range]);

  // While dragging, one CSS variable follows the pointer: no render, no animation.
  const live = (next: number) => {
    workspace.current?.style.setProperty(variable, `${next}px`);
    self.current?.setAttribute('aria-valuenow', String(next));
  };

  const reset = () => {
    const root = workspace.current;
    const to = clamp(home, maxOf(root, range));
    const from = renderedWidth(root, width);
    if (!root || from === to || reducedMotion()) {
      live(to);
      onReset();
      return;
    }
    for (const animation of root.getAnimations()) animation.cancel();
    const animation = root.animate([{ [variable]: `${from}px` }, { [variable]: `${to}px` }], {
      duration: MOTION.base,
      easing: MOTION.ease,
      fill: 'forwards',
    });
    animation.finished.then(
      () => {
        live(to);
        animation.cancel();
        onReset();
      },
      () => undefined,
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const root = workspace.current;
    if (!root) return;
    event.preventDefault();
    const handle = event.currentTarget;
    for (const animation of root.getAnimations()) animation.cancel();
    const top = maxOf(root, range);
    setMax(top);
    const start = renderedWidth(root, width);
    const x0 = event.clientX;
    let next = start;
    handle.setPointerCapture(event.pointerId);
    root.dataset.dragging = 'true';
    const move = (moved: globalThis.PointerEvent) => {
      next = clamp(start + moved.clientX - x0, top);
      live(next);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      delete root.dataset.dragging;
      if (next !== start) onCommit(next);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      reset();
      return;
    }
    const top = maxOf(workspace.current, range);
    const next = dividerKeyWidth(
      event.key,
      event.shiftKey,
      renderedWidth(workspace.current, width),
      top,
      limits,
    );
    if (next === undefined) return;
    event.preventDefault();
    live(next);
    onCommit(next);
  };

  const now = Math.min(width, max);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, draggable separator has no element of its own
    <div
      ref={self}
      className="divider"
      data-pane="divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={limits.min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter"
      title="Drag to resize · double-click resets"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    >
      <i />
    </div>
  );
}
