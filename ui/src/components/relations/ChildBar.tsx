import type { NodeKind } from '../../node-kind.ts';
import { childSegments } from '../../relations.ts';

type ChildBarProps = { kinds: readonly NodeKind[]; size: 'sm' | 'lg' };

// A parent's progress, one segment per child, colored like each child's node: closed on the left,
// then yours, then the agents'. Small in a list row, large in the detail.
export function ChildBar({ kinds, size }: ChildBarProps) {
  const closed = kinds.filter((kind) => kind === 'done' || kind === 'discarded').length;
  return (
    <span
      className="child-bar"
      data-size={size}
      role="img"
      aria-label={`${closed} of ${kinds.length} children closed`}
    >
      {childSegments(kinds).map((kind, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are drawn in a fixed order
        <i key={index} data-kind={kind} />
      ))}
    </span>
  );
}
