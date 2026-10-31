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
import { MOTION, reducedMotion } from '../motion.ts';
import {
  clampListWidth,
  defaultListWidth,
  dividerKeyWidth,
  forgetListWidth,
  LIST_WIDTH,
  listMax,
  readListWidth,
  readSidebar,
  type SplitStorage,
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
  };
}

type DividerProps = {
  workspace: RefObject<HTMLElement | null>;
  width: number;
  // The default width, which a double-click or Enter eases back to.
  home: number;
  onCommit: (width: number) => void;
  onReset: () => void;
};

// How wide the list may get: the list and the detail share their room, and the detail keeps 440px.
function maxOf(workspace: HTMLElement | null): number {
  if (!workspace) return LIST_WIDTH.max;
  const list = workspace.querySelector<HTMLElement>('[data-pane="list"]');
  const detail = workspace.querySelector<HTMLElement>('[data-pane="detail"]');
  if (!list || !detail) return LIST_WIDTH.max;
  return listMax(list.offsetWidth + detail.offsetWidth);
}

function renderedWidth(workspace: HTMLElement | null, fallback: number): number {
  const list = workspace?.querySelector<HTMLElement>('[data-pane="list"]');
  return list ? Math.round(list.offsetWidth) : fallback;
}

// The divider between the list and the detail: drag it (pointer events, live layout, no
// animation), or focus it and use the arrows (Shift for bigger steps), Home and End. A double-click
// or Enter eases it back to the default width.
export function Divider({ workspace, width, home, onCommit, onReset }: DividerProps) {
  const [max, setMax] = useState<number>(LIST_WIDTH.max);
  const self = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const measure = () => setMax(maxOf(root));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [workspace]);

  // While dragging, one CSS variable follows the pointer: no render, no animation.
  const live = (next: number) => {
    workspace.current?.style.setProperty('--list-w', `${next}px`);
    self.current?.setAttribute('aria-valuenow', String(next));
  };

  const reset = () => {
    const root = workspace.current;
    const to = clampListWidth(home, maxOf(root));
    const from = renderedWidth(root, width);
    if (!root || from === to || reducedMotion()) {
      live(to);
      onReset();
      return;
    }
    for (const animation of root.getAnimations()) animation.cancel();
    const animation = root.animate([{ '--list-w': `${from}px` }, { '--list-w': `${to}px` }], {
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
    const top = maxOf(root);
    setMax(top);
    const start = renderedWidth(root, width);
    const x0 = event.clientX;
    let next = start;
    handle.setPointerCapture(event.pointerId);
    root.dataset.dragging = 'true';
    const move = (moved: globalThis.PointerEvent) => {
      next = clampListWidth(start + moved.clientX - x0, top);
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
    const top = maxOf(workspace.current);
    const next = dividerKeyWidth(
      event.key,
      event.shiftKey,
      renderedWidth(workspace.current, width),
      top,
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
      aria-label="Resize the list"
      aria-valuemin={LIST_WIDTH.min}
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
