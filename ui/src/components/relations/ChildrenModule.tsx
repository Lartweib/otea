import { NodeMark } from '../../kit/index.ts';
import { childTrack, progressLabel } from '../../relations.ts';
import type { ChildrenSummary, ItemView, LayoutEntry, RelatedItem, Turn } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';
import { RelatedRow, relatedNodeKind } from './RelatedRow.tsx';

// The track is the list's lanes turned on their side: the agent lane above, yours below, fused into
// one trunk where the closed children sit.
const TRACK_H = 36;
const Y: Readonly<Record<Turn, number>> = { agent: 9, none: 18, human: 27 };

function laneY(turn: Turn): number {
  return Y[turn];
}

function trackWidth(count: number): number {
  return Math.min(420, Math.max(176, count * 46));
}

// Each lane runs to the last child. With children closed it leaves the trunk after the last closed
// one (`from`) and reaches its height at the first open one (`to`), with the same curve the list
// draws where its lanes fuse.
function lanePath(lane: number, end: number, from?: number, to?: number): string {
  if (from === undefined || to === undefined) return `M4 ${lane} H${end}`;
  const mid = (from + to) / 2;
  return `M${from} ${Y.none} C${mid} ${Y.none} ${mid} ${lane} ${to} ${lane} H${end}`;
}

function ChildTrackSvg({
  items: children,
  collectionOf,
}: {
  items: RelatedItem[];
  collectionOf: CollectionOf;
}) {
  const width = trackWidth(children.length);
  const track = childTrack(children, width);
  const end = width - 4;
  const openFrom = track.closedUntil;
  const firstOpen = track.nodes.find(({ child }) => child.closes === undefined)?.x;
  const allClosed = firstOpen === undefined;
  return (
    <svg
      className="child-track"
      width={width}
      height={TRACK_H}
      viewBox={`0 0 ${width} ${TRACK_H}`}
      aria-hidden="true"
    >
      {openFrom === undefined ? null : (
        <path className="ln" d={`M4 ${Y.none} H${allClosed ? end : openFrom}`} />
      )}
      {allClosed ? null : (
        <>
          <path className="ln" d={lanePath(Y.agent, end, openFrom, firstOpen)} />
          <path className="lny" d={lanePath(Y.human, end, openFrom, firstOpen)} />
        </>
      )}
      {track.nodes.map(({ id, x, child }) => (
        <g
          key={id}
          className="child-node"
          style={{ transform: `translate(${x}px, ${laneY(child.turn)}px)` }}
        >
          <NodeMark kind={relatedNodeKind(child, collectionOf)} cx={0} cy={0} r={track.r} />
        </g>
      ))}
    </svg>
  );
}

type ChildrenModuleProps = {
  item: ItemView;
  entry: LayoutEntry;
  canWrite: boolean;
  collectionOf: CollectionOf;
  onAddChild?: ((parent: ItemView) => void) | undefined;
};

// A parent's children: how far they got, drawn as nodes on the lanes, and each child with its node
// and state. Without children it draws nothing but, for a browser that can write, a quiet way to
// create one, shown when the detail is hovered or focused.
export function ChildrenModule({
  item,
  entry,
  canWrite,
  collectionOf,
  onAddChild,
}: ChildrenModuleProps) {
  const children = item.relations.filter(({ kind }) => kind === 'child');
  const add =
    canWrite && onAddChild ? (
      <button type="button" className="rel-add" onClick={() => onAddChild(item)}>
        <span className="rel-add-plus" aria-hidden="true">
          +
        </span>
        child
      </button>
    ) : null;
  if (children.length === 0) {
    return add ? (
      <section className="children-module" aria-label="Children" data-quiet="true">
        {add}
      </section>
    ) : null;
  }
  const closed = (how: string) => children.filter(({ closes }) => closes === how).length;
  const summary: ChildrenSummary = item.children ?? {
    total: children.length,
    open: children.length - closed('done') - closed('discarded'),
    done: closed('done'),
    discarded: closed('discarded'),
  };
  const headingId = `children-${item.id}`;
  return (
    <section className="children-module" aria-labelledby={headingId}>
      <header className="children-head">
        <h2 className="t-label" id={headingId}>
          {entry.label ?? 'children'}
        </h2>
        <span className="t-cap children-progress">{progressLabel(summary)}</span>
      </header>
      <ChildTrackSvg items={children} collectionOf={collectionOf} />
      <ul className="rel-list children-list">
        {children.map((child) => (
          <RelatedRow key={child.id} related={child} collectionOf={collectionOf} withState />
        ))}
      </ul>
      {add}
    </section>
  );
}
