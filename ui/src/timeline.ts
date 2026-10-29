import { LANE } from './lanes.ts';
import type { Actor } from './types.ts';

// The detail timeline is the item's own path: newest first, from its current state at the top down to
// where it was created, swinging between the agent lane and your lane with whoever acted.

export function actorX(kind: Actor['kind']): number {
  return kind === 'human' ? LANE.you : LANE.agent;
}

// One stacked block: its measured height and the lane its node sits on.
export type TimelineBlock = { height: number; x: number };

export type Point = { x: number; y: number };

export type TimelineLayout = {
  height: number;
  now: Point;
  stops: Point[];
  path: string;
  guides: string;
};

export function layoutTimeline(
  now: TimelineBlock,
  events: readonly TimelineBlock[],
): TimelineLayout {
  const head: Point = { x: now.x, y: now.height / 2 };
  const stops: Point[] = [];
  let top = now.height;
  let path = `M${head.x} ${head.y}`;
  let last = head;
  for (const { height, x } of events) {
    const stop = { x, y: top + height / 2 };
    const mid = (last.y + stop.y) / 2;
    path +=
      stop.x === last.x ? ` V${stop.y}` : ` C${last.x} ${mid} ${stop.x} ${mid} ${stop.x} ${stop.y}`;
    stops.push(stop);
    last = stop;
    top += height;
  }
  return {
    height: top,
    now: head,
    stops,
    path,
    guides: `M${LANE.agent} 0 V${top} M${LANE.you} 0 V${top}`,
  };
}
