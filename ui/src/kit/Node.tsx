import type { NodeKind } from '../node-kind.ts';

const SHAPE: Record<NodeKind, string> = {
  you: 's-you',
  working: 's-agent',
  queued: 's-agent',
  incomplete: 's-gap',
  done: 's-done',
  discarded: 's-drop',
};

export const NODE_LABEL: Record<NodeKind, string> = {
  you: 'Your turn',
  working: 'Agent working',
  queued: 'Agent queued',
  incomplete: 'Agent: incomplete',
  done: 'Done',
  discarded: 'Discarded',
};

type NodeMarkProps = { kind: NodeKind; cx: number; cy: number; r?: number };

const at = (cx: number, cy: number, k: number, points: [number, number][]) =>
  points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${cx + x * k} ${cy + y * k}`).join(' ');

// The node itself, to place inside any SVG (a lane gutter, a timeline).
export function NodeMark({ kind, cx, cy, r = 6 }: NodeMarkProps) {
  const k = r / 6;
  const orbit = r + 3;
  const around = 2 * Math.PI * orbit;
  return (
    <g className="node" data-kind={kind}>
      <circle
        className={kind === 'working' ? 'orbit on' : 'orbit'}
        cx={cx}
        cy={cy}
        r={orbit}
        style={{
          strokeDasharray: kind === 'working' ? `${around * 0.27} ${around * 0.73}` : `0 ${around}`,
        }}
      />
      <circle className={`shape ${SHAPE[kind]}`} cx={cx} cy={cy} r={r} />
      <path
        className={kind === 'done' ? 'mark check on' : 'mark check'}
        d={at(cx, cy, k, [
          [-3.1, 0.2],
          [-0.8, 2.5],
          [3.3, -2.1],
        ])}
      />
      <path
        className={kind === 'discarded' ? 'mark slash on' : 'mark slash'}
        d={at(cx, cy, k, [
          [-3.4, 3.4],
          [3.4, -3.4],
        ])}
      />
    </g>
  );
}

type NodeProps = { kind: NodeKind; label?: string };

// Standalone 20px glyph. Labelled when it carries meaning on its own, hidden otherwise.
export function Node({ kind, label }: NodeProps) {
  return (
    <svg
      className="glyph"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <NodeMark kind={kind} cx={10} cy={10} r={5.5} />
    </svg>
  );
}
