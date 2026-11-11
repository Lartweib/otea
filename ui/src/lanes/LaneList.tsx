import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Count } from '../kit/Count.tsx';
import { drawBranches } from './branch.ts';
import { registerList } from './dom.ts';
import { drawIn, retract } from './draw-in.ts';
import { type Lane, type LaneParams, lanePaths, X } from './geometry.ts';
import { listParams, runHandoff, type Snap, snap, type Universe } from './handoff.ts';
import { drawLight } from './light.ts';
import type { Look } from './looks.ts';
import { NodeGlyph } from './NodeGlyph.tsx';

// A list on the lanes (SPEC §4.2): keyed blocks over one SVG holding the lines, the light, the
// branches and the handoff's effects, in that order. React renders the blocks; the lanes are drawn
// imperatively after every commit and on resize. Every data change runs through the handoff.

export type LaneBlock =
  | {
      kind: 'row';
      key: string;
      lane: Lane;
      look: Look;
      sec: string;
      className?: string;
      child?: boolean;
      selected?: boolean;
      inert?: boolean;
      content: ReactNode;
    }
  | { kind: 'sec'; key: string; title: string; count: number; gloss?: string; action?: ReactNode }
  | { kind: 'empty'; key: string; content: ReactNode; big?: boolean }
  | { kind: 'other'; key: string; className: string; content: ReactNode };

export type LaneListHandle = {
  el: HTMLDivElement;
  svg: SVGSVGElement;
  redraw(): void;
  params(): LaneParams;
  drawIn(o?: { delay?: number; T?: number }): void;
  retract(T?: number): void;
};

export type LaneListProps = {
  list: 'toca' | 'atasco' | 'board' | 'table' | 'projects' | 'preview';
  blocks: LaneBlock[];
  universe?: Universe;
  sink?: boolean;
  drawInOnMount?: boolean | { delay?: number };
  onRow?: (key: string) => void;
  handle?: Ref<LaneListHandle>;
  className?: string;
};

// What a change of blocks is made of: when it differs, the handoff runs.
export function blocksSignature(blocks: readonly LaneBlock[]): string {
  return blocks
    .map((b) =>
      b.kind === 'row'
        ? `${b.key}|${b.lane}|${b.look}|${b.sec}|${b.child ? 1 : 0}`
        : b.kind === 'sec'
          ? `${b.key}|${b.count}`
          : b.key,
    )
    .join(',');
}

type Ghost = { block: LaneBlock; top: number; w: number };

const SVGINK =
  '<defs><linearGradient class="trg" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="var(--cc, var(--lane))" stop-opacity="0"/><stop offset="1" stop-color="var(--cc, var(--lane))" stop-opacity=".9"/></linearGradient></defs><g class="lines"><path class="ln lag" fill="none" stroke="var(--lane)" stroke-width="1"/><path class="ln lyou" fill="none" stroke="var(--you)" stroke-width="1"/><path class="ln ltr" fill="none" stroke-width="1"/></g><g class="glow"></g><g class="branch"></g><g class="fx"></g>';

function rowClass(b: Extract<LaneBlock, { kind: 'row' }>): string {
  return [
    'row',
    b.lane === 'none' ? 'closed' : '',
    b.look === 'dropped' ? 'dropped' : '',
    b.selected ? 'sel' : '',
    b.child ? 'child' : '',
    b.inert ? 'inert' : '',
    b.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Block({
  b,
  ghost,
  onRow,
}: {
  b: LaneBlock;
  ghost?: Ghost | undefined;
  onRow?: ((key: string) => void) | undefined;
}) {
  const ghostStyle: CSSProperties | undefined = ghost
    ? { top: `${ghost.top}px`, width: `${ghost.w}px` }
    : undefined;
  const g = ghost ? ' ghost' : '';
  if (b.kind === 'row') {
    const act = () => {
      if (!b.inert && !ghost) onRow?.(b.key);
    };
    const key = (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      act();
    };
    return (
      // biome-ignore lint/a11y/useSemanticElements: a row holds buttons of its own (the fold)
      <div
        className={rowClass(b) + g}
        data-k={b.key}
        data-h={b.lane}
        data-look={b.look}
        data-sec={b.sec}
        role="button"
        tabIndex={b.inert || ghost ? -1 : 0}
        aria-current={b.selected ? 'true' : undefined}
        style={{ '--x': `${X[b.lane]}px`, ...ghostStyle } as CSSProperties}
        onClick={act}
        onKeyDown={key}
      >
        <div className="lift">
          <div className="band" data-leaf="" />
          <NodeGlyph look={b.look} dataS={`${b.key}:node`} />
          {b.content}
        </div>
      </div>
    );
  }
  if (b.kind === 'sec') {
    return (
      <div className={`sec${g}`} data-k={b.key} style={ghostStyle}>
        <h2 data-leaf="">{b.title}</h2>
        <Count value={b.count} hold data-leaf="" />
        {b.gloss ? (
          <span className="gloss" data-leaf="">
            {b.gloss}
          </span>
        ) : null}
        <i className="rl" data-leaf="" />
        {b.action}
      </div>
    );
  }
  if (b.kind === 'empty') {
    return (
      <div
        className={`${b.big ? 'empty empty-big' : 'empty'}${g}`}
        data-k={b.key}
        data-leaf=""
        style={ghostStyle}
      >
        {b.content}
      </div>
    );
  }
  return (
    <div className={b.className + g} data-k={b.key} style={ghostStyle}>
      {b.content}
    </div>
  );
}

let firstDrawIn = true;

// How long after a list mounts a change of its blocks lands without a handoff.
const SETTLING = 900;

export function LaneList({
  list,
  blocks,
  universe,
  sink = false,
  drawInOnMount = false,
  onRow,
  handle,
  className,
}: LaneListProps) {
  const el = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const last = useRef<{ blocks: LaneBlock[]; sig: string; snap: Snap | null }>({
    blocks: [],
    sig: '',
    snap: null,
  });
  const universeRef = useRef(universe);
  // While the list first draws in, the data still arriving (the feed, the agents) lands in place.
  const born = useRef(0);
  universeRef.current = universe;
  const [ghosts, setGhosts] = useState<ReadonlyMap<string, Ghost>>(new Map());

  // Blocks that left since the last commit stay as ghosts until their handoff resolves.
  const keys = new Set(blocks.map((b) => b.key));
  const leaving = new Map(ghosts);
  for (const b of last.current.blocks) {
    if (keys.has(b.key) || leaving.has(b.key)) continue;
    const at = last.current.snap?.m.get(b.key);
    leaving.set(b.key, { block: b, top: at?.top ?? 0, w: at?.w ?? 0 });
  }
  for (const k of keys) leaving.delete(k);

  const redraw = useCallback(() => {
    const list = el.current;
    const ink = svg.current;
    if (!list || !ink) return;
    const p = listParams(list);
    ink.setAttribute('width', String(Math.max(1, p.W)));
    ink.setAttribute('height', String(Math.max(1, p.H)));
    const paths = lanePaths(p);
    const [lag, lyou, ltr] = ink.querySelectorAll('.lines .ln');
    lag?.setAttribute('d', paths.ag);
    lyou?.setAttribute('d', paths.you);
    ltr?.setAttribute('d', paths.trunk);
    ltr?.setAttribute('stroke', paths.trunkStroke);
    drawLight(ink, p);
    drawBranches(list);
  }, []);

  useImperativeHandle(
    handle,
    () => ({
      get el() {
        return el.current as HTMLDivElement;
      },
      get svg() {
        return svg.current as SVGSVGElement;
      },
      redraw,
      params: () =>
        el.current ? listParams(el.current) : listParams(document.createElement('div')),
      drawIn: (o) => drawIn(el.current, o),
      retract: (T) => retract(el.current, T),
    }),
    [redraw],
  );

  // After every commit: redraw, and when the blocks changed, run the change through the handoff.
  // The first frame of the handoff is written here, before the browser paints.
  const sig = blocksSignature(blocks);
  useLayoutEffect(() => {
    const list = el.current;
    if (!list) return;
    const prev = last.current;
    if (!born.current) born.current = performance.now();
    const settled = performance.now() - born.current > SETTLING;
    const changed = settled && prev.snap !== null && prev.sig !== sig;
    if (changed && prev.snap) {
      const A = prev.snap;
      const ghosted = new Map(leaving);
      if (ghosted.size !== ghosts.size || [...ghosted.keys()].some((k) => !ghosts.has(k))) {
        setGhosts(ghosted);
      }
      runHandoff(
        list,
        A,
        redraw,
        universeRef.current ? { universe: universeRef.current } : {},
      ).then(() => {
        setGhosts((now) => {
          const next = new Map(now);
          for (const k of ghosted.keys()) next.delete(k);
          return next.size === now.size ? now : next;
        });
        redraw();
        if (el.current) last.current.snap = snap(el.current, universeRef.current);
      });
    } else {
      // No handoff: what left goes at once (render again without its ghost).
      if (leaving.size) setGhosts(new Map());
      redraw();
    }
    last.current = { blocks, sig, snap: snap(list, universeRef.current) };
  });

  // On resize the lanes are drawn again and the snapshot taken again.
  useLayoutEffect(() => {
    const list = el.current;
    if (!list) return;
    const off = registerList(list, { redraw });
    const ro = new ResizeObserver(() => {
      redraw();
      last.current.snap = snap(list, universeRef.current);
    });
    ro.observe(list);
    return () => {
      ro.disconnect();
      off();
    };
  }, [redraw]);

  // The first appearance: the lanes draw in once the fonts are in (a 900 ms fallback).
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only
  useLayoutEffect(() => {
    if (!drawInOnMount) return;
    const delay =
      typeof drawInOnMount === 'object' && drawInOnMount.delay !== undefined
        ? drawInOnMount.delay
        : firstDrawIn
          ? 80
          : 160;
    firstDrawIn = false;
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      redraw();
      drawIn(el.current, { delay });
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts?.status === 'loaded') start();
    else {
      fonts?.ready.then(start);
      const timer = setTimeout(start, 900);
      return () => clearTimeout(timer);
    }
  }, []);

  // One keyed array, ghosts last: a block that leaves keeps its DOM node as it turns into a ghost.
  const shown: { b: LaneBlock; ghost?: Ghost }[] = [
    ...blocks.map((b) => ({ b })),
    ...[...leaving.values()].map((g) => ({ b: g.block, ghost: g })),
  ];
  return (
    <div
      ref={el}
      className={className ? `lanes ${className}` : 'lanes'}
      data-list={list}
      data-sink={sink ? '1' : undefined}
    >
      <svg
        ref={svg}
        className="ink"
        aria-hidden="true"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the fixed skeleton the lanes draw into
        dangerouslySetInnerHTML={{ __html: SVGINK }}
      />
      {shown.map(({ b, ghost }) => (
        <Block key={b.key} b={b} ghost={ghost} onRow={onRow} />
      ))}
    </div>
  );
}
