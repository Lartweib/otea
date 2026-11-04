import { t } from '../i18n/i18n.ts';
import { NodeMark } from '../kit/index.ts';
import type { NodeKind } from '../node-kind.ts';

// A workflow on the lanes, as the list draws its items: the agent's states on the left lane, yours
// on the right, the closed ones sunk into the trunk below. Moves are curves; the ones only you can
// make in Otea are drawn firmer.

export type LaneState = { name: string; turn: string; closes?: string | undefined };
export type LaneMove = { from: string; to: string; by: string };

type LanesProps = {
  states: readonly LaneState[];
  moves: readonly LaneMove[];
  initial: string | undefined;
  incomplete: string | undefined;
  width?: number;
  // The state the editor is on, ringed.
  focus?: string | undefined;
};

const STEP = 46;
const TOP = 26;

function order(
  states: readonly LaneState[],
  moves: readonly LaneMove[],
  entries: string[],
): string[] {
  const names = states.map(({ name }) => name);
  const seen: string[] = [];
  const queue = entries.filter((entry) => names.includes(entry));
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.includes(next)) continue;
    seen.push(next);
    for (const move of moves)
      if (move.from === next && !seen.includes(move.to)) queue.push(move.to);
  }
  return [...seen, ...names.filter((name) => !seen.includes(name))];
}

function kindOf(state: LaneState, incomplete: string | undefined): NodeKind {
  if (state.turn === 'none') return state.closes === 'done' ? 'done' : 'discarded';
  if (state.turn === 'human') return 'you';
  return state.name === incomplete ? 'incomplete' : 'queued';
}

export function Lanes({ states, moves, initial, incomplete, width = 340, focus }: LanesProps) {
  const entries = [incomplete, initial].filter((entry): entry is string => entry !== undefined);
  const sequence = order(states, moves, entries);
  const byName = new Map(states.map((state) => [state.name, state]));
  const open = sequence.filter((name) => byName.get(name)?.turn !== 'none');
  const closed = sequence.filter((name) => byName.get(name)?.turn === 'none');
  const agentX = Math.round(width * 0.3);
  const youX = Math.round(width * 0.52);
  const trunkX = Math.round((agentX + youX) / 2);
  const place = new Map<string, { x: number; y: number }>();
  open.forEach((name, index) => {
    place.set(name, {
      x: byName.get(name)?.turn === 'human' ? youX : agentX,
      y: TOP + index * STEP,
    });
  });
  const merge = TOP + Math.max(open.length - 1, 0) * STEP + 34;
  closed.forEach((name, index) => {
    place.set(name, { x: trunkX, y: merge + 30 + index * 38 });
  });
  const height = (closed.length > 0 ? merge + 30 + (closed.length - 1) * 38 : merge) + 24;
  const curve = (move: LaneMove, index: number) => {
    const a = place.get(move.from);
    const b = place.get(move.to);
    if (!a || !b || move.from === move.to) return null;
    const firm = move.by === 'human-ui';
    if (b.y < a.y) {
      // A move back up: a loop out to the right of both lanes.
      const out = Math.max(a.x, b.x) + 46 + (index % 3) * 10;
      return (
        <path
          key={index}
          className="st-lm back"
          d={`M${a.x + 7} ${a.y} C${out} ${a.y} ${out} ${b.y} ${b.x + 7} ${b.y}`}
        />
      );
    }
    const mid = (a.y + b.y) / 2;
    return (
      <path
        key={index}
        className={firm ? 'st-lm firm' : 'st-lm'}
        d={`M${a.x} ${a.y} C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`}
      />
    );
  };
  return (
    <svg
      className="st-lanes"
      width={width}
      height={height}
      viewBox={`0 -14 ${width} ${height + 14}`}
      role="img"
      aria-label={t('studio.lanes.aria')}
    >
      <text className="st-lh" x={agentX} y={-2} textAnchor="middle">
        {t('studio.lanes.agent')}
      </text>
      <text className="st-lh you" x={youX} y={-2} textAnchor="middle">
        {t('turn.you')}
      </text>
      <path
        className="st-ln"
        d={`M${agentX} 8 V${merge - 24} C${agentX} ${merge} ${trunkX} ${merge - 6} ${trunkX} ${merge + 18} V${height - 10}`}
      />
      <path
        className="st-ln you"
        d={`M${youX} 8 V${merge - 24} C${youX} ${merge} ${trunkX} ${merge - 6} ${trunkX} ${merge + 18}`}
      />
      {moves.map(curve)}
      {sequence.map((name) => {
        const state = byName.get(name);
        const at = place.get(name);
        if (!state || !at) return null;
        const left = state.turn === 'agent';
        return (
          <g key={name}>
            <NodeMark kind={kindOf(state, incomplete)} cx={at.x} cy={at.y} />
            {name === focus ? <circle className="st-focus" cx={at.x} cy={at.y} r={11} /> : null}
            <text
              className={state.turn === 'human' ? 'st-ml you' : 'st-ml'}
              x={left ? at.x - 16 : at.x + 16}
              y={at.y + 4}
              textAnchor={left ? 'end' : 'start'}
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
