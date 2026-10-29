import { useLayoutEffect, useRef, useState } from 'react';
import { describeEvent, eventActorLabel, formatTime } from '../format.ts';
import { NodeMark } from '../kit/index.ts';
import { laneX } from '../lanes.ts';
import type { NodeKind } from '../node-kind.ts';
import { actorX, layoutTimeline } from '../timeline.ts';
import type { ItemEvent, Turn } from '../types.ts';

const BLOCK_H = 44;

type TimelineProps = { events: ItemEvent[]; turn: Turn; kind: NodeKind; now: string };

// Heights of the listed blocks, measured so a wrapped event keeps its node beside its first line.
function useHeights(count: number) {
  const list = useRef<HTMLOListElement>(null);
  const [heights, setHeights] = useState<number[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new count means new blocks to observe
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => {
      const next = [...element.children].map((child) => (child as HTMLElement).offsetHeight);
      setHeights((current) =>
        current.length === next.length && current.every((h, i) => h === next[i]) ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [count]);
  return { list, heightOf: (index: number) => heights[index] ?? BLOCK_H };
}

// The item's own path: from where it stands now, at the top, down to where it was created.
export function Timeline({ events, turn, kind, now }: TimelineProps) {
  const newestFirst = [...events].reverse();
  // Events that arrive while the item is open fade in; those already there do not.
  const [knownUpTo] = useState(() => Math.max(0, ...events.map((event) => event.id)));
  const { list, heightOf } = useHeights(newestFirst.length + 1);
  const layout = layoutTimeline(
    { height: heightOf(0), x: laneX(turn) },
    newestFirst.map((event, index) => ({
      height: heightOf(index + 1),
      x: actorX(event.actor.kind),
    })),
  );
  return (
    <div className="timeline" style={{ minHeight: layout.height }}>
      <svg
        className="timeline-lanes"
        width="56"
        height={layout.height}
        viewBox={`0 0 56 ${layout.height}`}
        aria-hidden="true"
      >
        <path className="timeline-guides" d={layout.guides} />
        <path className="timeline-path" style={{ d: `path('${layout.path}')` }} />
        {layout.stops.map((stop, index) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: a stop is the event drawn at the same index
            key={index}
            className="timeline-dot"
            data-actor={newestFirst[index]?.actor.kind}
            cx={stop.x}
            cy={stop.y}
            r="4.5"
          />
        ))}
        <NodeMark kind={kind} cx={layout.now.x} cy={layout.now.y} />
      </svg>
      <ol className="timeline-events" ref={list}>
        <li className="ev ev-now">
          <span className="t-cap">now</span>
          <span className="ev-m">{now}</span>
        </li>
        {newestFirst.map((event) => (
          <li
            key={event.id}
            className={event.id > knownUpTo ? 'ev new' : 'ev'}
            data-actor={event.actor.kind}
          >
            <time className="t-cap" dateTime={event.at}>
              {formatTime(event.at)}
            </time>
            <span className="ev-m">
              {describeEvent(event)} <em>· {eventActorLabel(event)}</em>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
