import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { miniRoute } from './mini-route.ts';

// A board's small route (mini-route.ts): the lanes, the walk through every step, a node per step
// on the lane of whoever does it, your reviews as small filled nodes, Hecho at the end.
export function MiniRoute({ def, width = 196 }: { def: BoardDefinition; width?: number }) {
  const r = miniRoute(def, width);
  return (
    <svg
      className="minir"
      width={r.width}
      height={r.height}
      viewBox={r.viewBox}
      aria-hidden="true"
      focusable="false"
    >
      <path className="mr-lane ag" d={r.lanes.ag} />
      <path className="mr-lane you" d={r.lanes.you} />
      <path className="mr-lane none" d={r.lanes.trunk} />
      <path className="mr-walk" d={r.walked} />
      {r.nodes.map((n) => (
        <circle
          key={`${n.kind}:${n.x}:${n.y}`}
          className={`mr-node ${n.kind}`}
          cx={n.x}
          cy={n.y}
          r={n.kind === 'ag' ? 10 : n.kind === 'review' ? 8 : 11}
        />
      ))}
    </svg>
  );
}
