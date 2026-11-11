import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { retract } from '../lanes/draw-in.ts';
import { C } from '../motion/curves.ts';
import { reduced } from '../motion/reduced.ts';
import { useWorkspace } from './workspace.ts';

// The view host (SPEC §6.6, mock:2361-2393): the view for the route, keyed by its identity. On a
// change the old view stays, .leaving: its lanes retract and it fades up out of sight; the new one
// comes in, its head rising, its tools fading in, its lanes drawing in (LaneList does that).

type Entry = { key: string; node: ReactNode };

type ViewHostProps = {
  // The view's identity: a new key is a new view.
  viewKey: string;
  // data-v, what the view is (toca, atasco, board, …).
  kind: string;
  children: ReactNode;
};

function enter(view: HTMLElement): void {
  if (reduced()) {
    view.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: C.drift });
    return;
  }
  for (const head of view.querySelectorAll('[data-enter="head"]')) {
    head.animate(
      [
        { opacity: 0, transform: 'translateY(6px)', filter: 'blur(1px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 420, delay: 60, easing: C.glide, fill: 'backwards' },
    );
  }
  for (const e of view.querySelectorAll('[data-enter="fade"]')) {
    e.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 360,
      delay: 140,
      easing: C.drift,
      fill: 'backwards',
    });
  }
}

function leave(view: HTMLElement): Promise<void> {
  const R = reduced();
  for (const list of view.querySelectorAll<HTMLElement>('.lanes')) retract(list);
  return view
    .animate(
      [
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        {
          opacity: 0,
          transform: R ? 'none' : 'translateY(-6px)',
          filter: R ? 'blur(0px)' : 'blur(1px)',
        },
      ],
      { duration: R ? 160 : 240, easing: C.drift, fill: 'forwards' },
    )
    .finished.then(
      () => undefined,
      () => undefined,
    );
}

export function ViewHost({ viewKey, kind, children }: ViewHostProps) {
  const ws = useWorkspace();
  const [leaving, setLeaving] = useState<(Entry & { kind: string })[]>([]);
  const current = useRef<Entry & { kind: string }>({ key: viewKey, node: children, kind });
  const els = useRef(new Map<string, HTMLDivElement>());
  const changed = current.current.key !== viewKey;
  if (changed) {
    const was = current.current;
    setLeaving((l) => [...l.filter((e) => e.key !== was.key && e.key !== viewKey), was]);
  }
  current.current = { key: viewKey, node: children, kind };
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const view = els.current.get(viewKey);
    if (view) enter(view);
  }, [viewKey]);

  useLayoutEffect(() => {
    for (const e of leaving) {
      const el = els.current.get(e.key);
      if (!el || el.dataset.leavingStarted) continue;
      el.dataset.leavingStarted = '1';
      leave(el).then(() => setLeaving((l) => l.filter((x) => x.key !== e.key)));
    }
  }, [leaving]);

  const shown = [
    ...leaving.filter((e) => e.key !== viewKey).map((e) => ({ ...e, gone: true })),
    { ...current.current, gone: false },
  ];
  return (
    <>
      {shown.map((e) => (
        <div
          key={e.key}
          ref={(el) => {
            if (el) els.current.set(e.key, el);
            else els.current.delete(e.key);
          }}
          className={
            e.gone
              ? 'view leaving'
              : ['view', ws.narrow ? 'narrow chead' : ''].filter(Boolean).join(' ')
          }
          data-v={e.kind}
          aria-hidden={e.gone || undefined}
        >
          {e.node}
        </div>
      ))}
    </>
  );
}
