import { useLayoutEffect, useRef, useState } from 'react';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Icon, Node } from '../kit/index.ts';
import type { NodeKind } from '../node-kind.ts';
import type { RawPreset } from './draft.ts';
import { laneLayout, type PlacedMove, type PlacedState } from './lanes-edit.ts';

// The workflow on the lanes, as the list draws it: the agent's lane on the left, yours on the right,
// the closed states below. Every state and every move is a button that opens it in the inspector;
// + state and + move sit on the graph.

export type LaneChoice =
  | { kind: 'state'; name: string }
  | { kind: 'move'; index: number }
  | { kind: 'new-state' }
  | { kind: 'new-move' };

export const BY_LABEL: Record<string, PlainKey> = {
  agent: 'studio.lanes.by.agent',
  human: 'studio.lanes.by.human',
  'human-ui': 'studio.lanes.by.humanUi',
};

export const byWord = (by: string | undefined) =>
  by && BY_LABEL[by] ? t(BY_LABEL[by] as PlainKey) : (by ?? '');

export function moveWord(by: string | undefined, reason: boolean): string {
  return reason ? `${byWord(by)} · ${t('studio.lanes.reason')}` : byWord(by);
}

function kindOf(state: PlacedState, incomplete: string | undefined): NodeKind {
  if (state.turn === 'none') return state.closes === 'done' ? 'done' : 'discarded';
  if (state.turn === 'human') return 'you';
  return state.name === incomplete ? 'incomplete' : 'queued';
}

type LanesEditProps = {
  raw: RawPreset;
  type: string;
  incomplete: string | undefined;
  width: number;
  choice: LaneChoice | undefined;
  onChoose: (choice: LaneChoice) => void;
  // Off while the preset cannot be edited here: no + state, no + move.
  editable: boolean;
};

const PILL = 13;

type Curve = { d: string; x: number; y: number; back: boolean };

function curveOf(a: PlacedState, b: PlacedState, index: number): Curve {
  if (b.y > a.y) {
    const mid = (a.y + b.y) / 2;
    return {
      d: `M${a.x} ${a.y + PILL} C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y - PILL}`,
      x: (a.x + b.x) / 2,
      y: mid,
      back: false,
    };
  }
  // A move back up: a loop out to the right of both lanes.
  const out = Math.max(a.x, b.x) + 120 + (index % 3) * 22;
  const right = (x: number) => x + 54;
  return {
    d: `M${right(a.x)} ${a.y} C${out} ${a.y} ${out} ${b.y} ${right(b.x)} ${b.y}`,
    x: out - 24,
    y: (a.y + b.y) / 2,
    back: true,
  };
}

// The width the lanes fit in: the room they are given, up to their widest.
function useFit(widest: number) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(widest);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const resize = () => setWidth(Math.max(320, Math.min(widest, element.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [widest]);
  return { box, width };
}

export function LanesEdit({
  raw,
  type,
  incomplete,
  width: widest,
  choice,
  onChoose,
  editable,
}: LanesEditProps) {
  const { box, width } = useFit(widest);
  const layout = laneLayout(raw, type, width);
  const at = new Map(layout.states.map((state) => [state.name, state]));
  const discarded = layout.states.filter(
    (state) => state.turn === 'none' && state.closes !== 'done',
  );
  const drawn = layout.moves.filter((move) => {
    const to = at.get(move.to);
    return to !== undefined && !(to.turn === 'none' && to.closes !== 'done');
  });
  const into = layout.moves.find((move) => discarded.some(({ name }) => name === move.to));
  const isMove = (move: PlacedMove) => choice?.kind === 'move' && choice.index === move.index;
  const lastOpen = Math.max(...layout.states.filter((s) => s.turn !== 'none').map((s) => s.y), 0);
  return (
    <div className="st-led-fit" ref={box}>
      <div className="st-led" style={{ width: `${width}px`, height: `${layout.height}px` }}>
        <span className="st-led-h" style={{ left: `${layout.agentX}px` }}>
          {t('studio.lanes.agentTurn')}
        </span>
        <span className="st-led-h you" style={{ left: `${layout.youX}px` }}>
          {t('turn.yours')}
        </span>
        <svg
          className="st-led-svg"
          width={width}
          height={layout.height}
          viewBox={`0 0 ${width} ${layout.height}`}
          aria-hidden="true"
        >
          <path className="st-led-lane" d={`M${layout.agentX} 30 V${lastOpen + 40}`} />
          <path className="st-led-lane you" d={`M${layout.youX} 30 V${layout.closedY - 30}`} />
          {drawn.map((move) => {
            const a = at.get(move.from);
            const b = at.get(move.to);
            if (!a || !b || a === b) return null;
            const curve = curveOf(a, b, move.index);
            return (
              <path
                key={`${move.index}-${move.from}`}
                className={`st-led-move${move.by === 'human-ui' ? ' firm' : ''}${isMove(move) ? ' on' : ''}`}
                d={curve.d}
              />
            );
          })}
        </svg>
        {drawn.map((move) => {
          const a = at.get(move.from);
          const b = at.get(move.to);
          if (!a || !b || a === b || !move.labelled) return null;
          const curve = curveOf(a, b, move.index);
          return (
            <button
              key={`label-${move.index}`}
              type="button"
              className="st-led-label"
              aria-pressed={isMove(move)}
              aria-label={t('studio.lanes.moveAria', {
                from: move.from,
                to: move.to,
                by: moveWord(move.by, move.reason),
              })}
              style={{ left: `${curve.x}px`, top: `${curve.y}px` }}
              onClick={() => onChoose({ kind: 'move', index: move.index })}
            >
              {moveWord(move.by, move.reason)}
            </button>
          );
        })}
        {layout.states.map((state) => (
          <button
            key={state.name}
            type="button"
            className={`st-led-state${state.turn === 'none' ? ' closed' : ''}`}
            aria-pressed={choice?.kind === 'state' && choice.name === state.name}
            style={{ left: `${state.x}px`, top: `${state.y}px` }}
            onClick={() => onChoose({ kind: 'state', name: state.name })}
          >
            <Node kind={kindOf(state, incomplete)} label={state.name} />
            <span>{state.name}</span>
          </button>
        ))}
        {discarded.length > 0 ? (
          <span className="st-led-closed" style={{ top: `${layout.closedY - 34}px` }}>
            {into
              ? t('studio.lanes.discardedBy', { by: moveWord(into.by, into.reason) })
              : t('studio.lanes.discarded')}
          </span>
        ) : null}
        {editable ? (
          <span className="st-led-add" style={{ top: `${lastOpen + 52}px` }}>
            <button
              type="button"
              className="st-led-plus"
              aria-pressed={choice?.kind === 'new-state'}
              onClick={() => onChoose({ kind: 'new-state' })}
            >
              <Icon name="plus" />
              {t('studio.lanes.addState')}
            </button>
            <button
              type="button"
              className="st-led-plus"
              aria-pressed={choice?.kind === 'new-move'}
              onClick={() => onChoose({ kind: 'new-move' })}
            >
              <Icon name="plus" />
              {t('studio.lanes.addMove')}
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
