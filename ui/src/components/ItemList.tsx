import type { CSSProperties } from 'react';
import { leaseLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import { NodeMark } from '../kit/index.ts';
import { type Block, laneX, layoutLanes } from '../lanes.ts';
import { nodeKind } from '../node-kind.ts';
import type { Section } from '../sections.ts';
import { hashFor } from '../selection.ts';
import type { Item } from '../types.ts';

// Fixed heights keep the lane geometry and the rows in step.
const ROW_H = 56;
const HEAD_H = 48;
const EMPTY_H = 40;

type IncompleteOf = (collection: string) => string | undefined;

type ItemListProps = {
  sections: Section[];
  selectedId: string | undefined;
  incompleteOf: IncompleteOf;
};

type ItemRowProps = { item: Item; selected: boolean; x: number; incompleteOf: IncompleteOf };

function ItemRow({ item, selected, x, incompleteOf }: ItemRowProps) {
  const lease = useActiveLease(item.lease);
  const kind = nodeKind({
    turn: item.turn,
    state: item.state,
    leased: lease !== null,
    incomplete: incompleteOf(item.collection) === item.state,
  });
  return (
    <li>
      <a
        className="row"
        data-kind={kind}
        href={hashFor(item.id)}
        aria-current={selected ? 'true' : undefined}
      >
        <svg
          className="row-node"
          width="56"
          height={ROW_H}
          viewBox={`0 0 56 ${ROW_H}`}
          aria-hidden="true"
        >
          <NodeMark kind={kind} cx={x} cy={ROW_H / 2} />
        </svg>
        <span className="row-main">
          <span className="ttl">{item.title}</span>
          <span className="row-meta">
            <span className="row-id">{item.id}</span>
            <span>{item.state}</span>
            {lease ? <span className="row-lease">{leaseLabel(lease)}</span> : null}
          </span>
        </span>
      </a>
    </li>
  );
}

function blocksOf(sections: Section[]): Block[] {
  return sections.flatMap((section) => [
    { height: HEAD_H },
    ...(section.items.length === 0
      ? [{ height: EMPTY_H }]
      : section.items.map((item) => ({ height: ROW_H, turn: item.turn }))),
  ]);
}

export function ItemList({ sections, selectedId, incompleteOf }: ItemListProps) {
  const layout = layoutLanes(blocksOf(sections));
  const sizes = {
    '--row-h': `${ROW_H}px`,
    '--head-h': `${HEAD_H}px`,
    '--empty-h': `${EMPTY_H}px`,
  } as CSSProperties;
  return (
    <nav className="item-list" aria-label="Items" style={sizes}>
      <div className="lane-head" aria-hidden="true">
        <span>ag</span>
        <span className="lane-head-you">you</span>
      </div>
      <div className="lanes-body" style={{ height: layout.height }}>
        <svg
          className="lanes"
          width="56"
          height={layout.height}
          viewBox={`0 0 56 ${layout.height}`}
          aria-hidden="true"
        >
          <path className="ln" d={layout.agentLane} />
          <path className="lny" d={layout.youLane} />
          <path className="ln" d={layout.trunk} />
        </svg>
        {sections.map((section) => (
          <section key={section.turn} className="section" data-turn={section.turn}>
            <h2 className="section-title">
              {section.title}
              <span className="count">{section.items.length}</span>
            </h2>
            {section.items.length === 0 ? (
              <p className="section-empty">Nothing here.</p>
            ) : (
              <ul className="rows">
                {section.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    x={laneX(item.turn)}
                    selected={item.id === selectedId}
                    incompleteOf={incompleteOf}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </nav>
  );
}
