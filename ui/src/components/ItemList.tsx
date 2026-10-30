import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { leaseLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import { rowValues, showsTypes, typeOf } from '../item-types.ts';
import { Button, Icon, NodeMark, TypeTag } from '../kit/index.ts';
import { type Block, laneX, layoutLanes } from '../lanes.ts';
import { moduleFor } from '../modules/registry.ts';
import type { NestedSection, RowNesting } from '../nesting.ts';
import { itemNodeKind } from '../node-kind.ts';
import { hashFor } from '../selection.ts';
import type { CollectionView, Item } from '../types.ts';
import { afterFold, panelOf, reopen, select, type UnfoldState } from '../unfold.ts';
import { Carry } from './Carry.tsx';
import { Unfold } from './Unfold.tsx';

// Fixed heights keep the lane geometry and the rows in step.
const ROW_H = 56;
const HEAD_H = 48;
const EMPTY_H = 40;

export type CollectionOf = (name: string) => CollectionView | undefined;

// On a phone the selected row unfolds in place into its detail; tapping it again folds it.
export type Unfolding = { detail: (id: string) => ReactNode; onFold: () => void };

type ItemListProps = {
  sections: NestedSection[];
  // How each row nests under its parent, and the parents folded by this viewer.
  nesting?: ReadonlyMap<string, RowNesting>;
  onToggleChildren?: (id: string) => void;
  selectedId: string | undefined;
  collectionOf: CollectionOf;
  // The list being shown (a collection, or all): changing it is not a motion.
  scope: string;
  unfolding?: Unfolding;
  // Opens swipe triage, from the head of what waits for you.
  onTriage?: () => void;
};

type ItemRowProps = {
  item: Item;
  selected: boolean;
  x: number;
  collectionOf: CollectionOf;
  nesting?: RowNesting | undefined;
  onToggleChildren?: (() => void) | undefined;
  // Set on a phone: whether the row is unfolded, and what tapping it does instead of following its link.
  expanded?: boolean | undefined;
  onTap?: (() => void) | undefined;
  children?: ReactNode;
};

// What each field module of the type's row slot puts in the row; most put nothing (an empty
// wrapper is hidden by CSS).
function RowValues({ item, collection }: { item: Item; collection: CollectionView | undefined }) {
  const type = typeOf(collection, item.type);
  const marks = rowValues(type, item.fields).flatMap(({ field, value }) => {
    const { Row } = moduleFor(field.module);
    return Row ? [<Row key={field.name} field={field} value={value} />] : [];
  });
  return marks.length > 0 ? <span className="row-values">{marks}</span> : null;
}

// A parent's open children, quiet in the meta line: how many of all are still open.
function OpenChildren({ item }: { item: Item }) {
  const summary = item.children;
  if (!summary || summary.open === 0) return null;
  return (
    <span className="row-children" title={`${summary.open} of ${summary.total} children open`}>
      <Icon name="branch" />
      {summary.open}/{summary.total} open
    </span>
  );
}

// Folds or unfolds the children nested under a parent row; folded, it says how many it holds.
function FoldChildren({
  item,
  nesting,
  onToggle,
}: {
  item: Item;
  nesting: RowNesting;
  onToggle: () => void;
}) {
  const folded = nesting.collapsed === true;
  return (
    <button
      type="button"
      className="row-fold"
      aria-expanded={!folded}
      aria-label={`${folded ? 'Show' : 'Fold'} the children of ${item.id}`}
      data-folded={folded || undefined}
      onClick={onToggle}
    >
      {folded ? <span className="row-fold-count">{nesting.nested}</span> : null}
      <Icon name="chevron" />
    </button>
  );
}

function ItemRow({
  item,
  selected,
  x,
  collectionOf,
  nesting,
  onToggleChildren,
  expanded,
  onTap,
  children,
}: ItemRowProps) {
  const lease = useActiveLease(item.lease);
  const collection = collectionOf(item.collection);
  const type = typeOf(collection, item.type);
  const kind = itemNodeKind(item, type, lease !== null);
  const depth = Math.min(nesting?.depth ?? 0, 3);
  const folds = nesting?.nested !== undefined && onToggleChildren !== undefined;
  return (
    <li data-flip={item.id} data-turn={item.turn} data-x={x} data-folds={folds || undefined}>
      <a
        className="row"
        data-kind={kind}
        data-depth={depth > 0 ? depth : undefined}
        href={hashFor(item.id)}
        aria-current={selected ? 'true' : undefined}
        aria-expanded={expanded}
        onClick={(event) => {
          if (!onTap) return;
          event.preventDefault();
          onTap();
        }}
      >
        <svg
          className="row-node"
          width="56"
          height={ROW_H}
          viewBox={`0 0 56 ${ROW_H}`}
          aria-hidden="true"
        >
          <circle className="ghost" cx={x} cy={ROW_H / 2} r="6" />
          <g className="carry">
            <g className="lift">
              <circle className="halo" cx={x} cy={ROW_H / 2} r="6" />
              <NodeMark kind={kind} cx={x} cy={ROW_H / 2} />
            </g>
          </g>
        </svg>
        <span className="row-main">
          <span className="ttl">{item.title}</span>
          <span className="row-meta">
            {showsTypes(collection) ? (
              <TypeTag name={item.type} label={type?.label ?? item.type} />
            ) : null}
            <span className="row-id">{item.id}</span>
            <span>{item.state}</span>
            {lease ? <span className="row-lease">{leaseLabel(lease)}</span> : null}
            <OpenChildren item={item} />
          </span>
        </span>
        <RowValues item={item} collection={collection} />
      </a>
      {folds && nesting && onToggleChildren ? (
        <FoldChildren item={item} nesting={nesting} onToggle={onToggleChildren} />
      ) : null}
      {children}
    </li>
  );
}

// panels: the height of each unfolded detail, which its row's block grows by.
function blocksOf(sections: NestedSection[], panels: ReadonlyMap<string, number>): Block[] {
  return sections.flatMap((section) => [
    { height: HEAD_H },
    ...(section.items.length === 0
      ? [{ height: EMPTY_H }]
      : section.items.map((item) => {
          const panel = panels.get(item.id);
          return panel === undefined
            ? { height: ROW_H, turn: item.turn }
            : { height: ROW_H + panel, turn: item.turn, node: ROW_H / 2 };
        })),
  ]);
}

// Where an element sits in the page, ignoring the transforms of rows still making room.
function pageTop(element: HTMLElement): number {
  let top = 0;
  for (let at: HTMLElement | null = element; at; at = at.offsetParent as HTMLElement | null) {
    top += at.offsetTop;
  }
  return top;
}

// Keeps the selected row in view when it changes (j and k move it beyond the fold). An unfolded row is
// brought to the top, so its detail has the screen.
function useSelectedInView(selectedId: string | undefined, unfolds: boolean) {
  const list = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId === undefined) return;
    const row = list.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row) return;
    if (!unfolds) {
      row.scrollIntoView({ block: 'nearest' });
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: pageTop(row) - 8, behavior: reduced ? 'instant' : 'smooth' });
  }, [selectedId, unfolds]);
  return list;
}

// The rows that show a detail (see unfold.ts), and how tall each detail is.
function useUnfolded(selectedId: string | undefined, sections: NestedSection[]) {
  const [state, setState] = useState<UnfoldState>({});
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const items = sections.flatMap((section) => section.items);
  const current = select(state, selectedId, (id) => items.find((item) => item.id === id)?.turn);
  if (current !== state) setState(current);
  const panel = (item: Item) => panelOf(current, item);
  const panels = new Map(
    items.flatMap((item) => {
      const height = heights.get(item.id);
      return panel(item) && height !== undefined ? [[item.id, height] as const] : [];
    }),
  );
  const measured = (id: string) => (height: number) =>
    setHeights((known) => (known.get(id) === height ? known : new Map(known).set(id, height)));
  const folded = (id: string) => () => {
    setState((known) => afterFold(known, id));
    setHeights((known) => {
      const next = new Map(known);
      next.delete(id);
      return next;
    });
  };
  const open = (item: Item) => setState((known) => reopen(known, item));
  return { panel, panels, measured, folded, open };
}

function TriageOpen({ onTriage }: { onTriage: () => void }) {
  return (
    <Button variant="quiet" size="sm" className="triage-open" onClick={onTriage}>
      <Icon name="cards" />
      Triage
    </Button>
  );
}

const NO_PANELS: ReadonlyMap<string, number> = new Map();

export function ItemList({
  sections,
  nesting,
  onToggleChildren,
  selectedId,
  collectionOf,
  scope,
  unfolding,
  onTriage,
}: ItemListProps) {
  const list = useSelectedInView(selectedId, unfolding !== undefined);
  const { panel, panels, measured, folded, open } = useUnfolded(selectedId, sections);
  const layout = layoutLanes(blocksOf(sections, unfolding ? panels : NO_PANELS));
  const sizes = {
    '--row-h': `${ROW_H}px`,
    '--head-h': `${HEAD_H}px`,
    '--empty-h': `${EMPTY_H}px`,
  } as CSSProperties;
  return (
    <nav className="item-list" aria-label="Items" style={sizes} ref={list}>
      <div className="lane-head" aria-hidden="true">
        <span>ag</span>
        <span className="lane-head-you">you</span>
      </div>
      <Carry scope={scope} className="lanes-body" style={{ height: layout.height }}>
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
            <h2 className="section-title" data-flip={`head:${section.turn}`}>
              {section.title}
              <span className="count">{section.total}</span>
              {section.turn === 'human' && section.items.length > 0 && onTriage ? (
                <TriageOpen onTriage={onTriage} />
              ) : null}
            </h2>
            {section.items.length === 0 ? (
              <p className="section-empty" data-flip={`empty:${section.turn}`}>
                Nothing here.
              </p>
            ) : (
              <ul className="rows">
                {section.items.map((item) => {
                  const selected = item.id === selectedId;
                  const shows = unfolding ? panel(item) : undefined;
                  // A selected row that changed hands sits folded in its new place: a tap opens it again.
                  const tap = shows === 'open' ? unfolding?.onFold : () => open(item);
                  return (
                    <ItemRow
                      key={item.id}
                      item={item}
                      x={laneX(item.turn)}
                      selected={selected}
                      collectionOf={collectionOf}
                      nesting={nesting?.get(item.id)}
                      onToggleChildren={
                        onToggleChildren ? () => onToggleChildren(item.id) : undefined
                      }
                      expanded={unfolding ? shows === 'open' : undefined}
                      onTap={unfolding && selected ? tap : undefined}
                    >
                      {unfolding && shows ? (
                        <Unfold
                          open={shows === 'open'}
                          onFolded={folded(item.id)}
                          onHeight={measured(item.id)}
                        >
                          {unfolding.detail(item.id)}
                        </Unfold>
                      ) : null}
                    </ItemRow>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </Carry>
    </nav>
  );
}
