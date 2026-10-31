import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { ageLabel, holdLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { rowValues, showsTypes, typeOf } from '../item-types.ts';
import { Button, Icon, NodeMark, TypeTag } from '../kit/index.ts';
import { type Block, type BranchRow, laneX, layoutBranches, layoutLanes } from '../lanes.ts';
import { activeLease } from '../lease.ts';
import { moduleFor } from '../modules/registry.ts';
import type { NestedSection, ParentRef, RowNesting } from '../nesting.ts';
import { itemNodeKind, type NodeKind } from '../node-kind.ts';
import { openLabel } from '../relations.ts';
import { hashFor } from '../selection.ts';
import type { CollectionView, Item } from '../types.ts';
import { afterFold, panelOf, reopen, select, type UnfoldState } from '../unfold.ts';
import { Carry } from './Carry.tsx';
import { ChildBar } from './relations/ChildBar.tsx';
import { Unfold } from './Unfold.tsx';

// Fixed heights keep the lane geometry and the rows in step. A row reads in two lines, title over
// meta, its node on the title line; a child under its parent is one line, one size smaller.
const ROW_H = 66;
const CHILD_H = 44;
const NODE_Y = 24;
const HEAD_H = 60;
const FIRST_HEAD_H = 34;
const EMPTY_H = 40;

export type CollectionOf = (name: string) => CollectionView | undefined;

// The children of an item, wherever they are listed.
export type ChildrenOf = (id: string) => readonly Item[];

// On a phone the selected row unfolds in place into its detail; tapping it again folds it.
export type Unfolding = { detail: (id: string) => ReactNode; onFold: () => void };

type ItemListProps = {
  sections: NestedSection[];
  // How each row nests under its parent, and the parents folded by this viewer.
  nesting?: ReadonlyMap<string, RowNesting>;
  onToggleChildren?: (id: string, settled: boolean) => void;
  childrenOf?: ChildrenOf;
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
  // The node of each of its children, for a parent's progress bar.
  childKinds: NodeKind[];
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

// A parent's children at a glance: one segment each, and how many are still open.
function Progress({ item, kinds }: { item: Item; kinds: NodeKind[] }) {
  const summary = item.children;
  if (!summary || kinds.length === 0) return null;
  return (
    <span className="row-progress">
      <ChildBar kinds={kinds} size="sm" />
      <span title={openLabel(summary)}>
        {summary.open}
        <span className="row-progress-of"> of {summary.total}</span> open
      </span>
    </span>
  );
}

// Folds or unfolds the children nested under a parent; folded, it says how many it holds.
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

// The parent of a row listed in another group, on the row's meta line: it selects the parent.
function ParentLink({ parent }: { parent: ParentRef }) {
  return (
    <a
      className="row-parent"
      href={hashFor(parent.id)}
      title={parent.title ? `Child of ${parent.id} ${parent.title}` : `Child of ${parent.id}`}
    >
      <span aria-hidden="true">↑</span> <span className="row-parent-id">{parent.id}</span>
      {parent.title ? ` ${parent.title}` : null}
    </a>
  );
}

function ItemRow({
  item,
  selected,
  x,
  collectionOf,
  childKinds,
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
  const height = depth > 0 ? CHILD_H : ROW_H;
  const node = depth > 0 ? CHILD_H / 2 : NODE_Y;
  const folds = nesting?.nested !== undefined && onToggleChildren !== undefined;
  const label = type?.label ?? item.type;
  const marked = showsTypes(collection);
  const icon = type?.icon;
  const parent = depth === 0 ? nesting?.parent : undefined;
  return (
    <li data-flip={item.id} data-turn={item.turn} data-x={x} data-folds={folds || undefined}>
      {/* The title is the row's link, stretched over the whole row; the parent reference on the
          meta line is a link of its own above it. */}
      <div
        className="row"
        data-kind={kind}
        data-depth={depth > 0 ? depth : undefined}
        data-current={selected || undefined}
        data-expanded={expanded || undefined}
      >
        <svg
          className="row-node"
          width="56"
          height={height}
          viewBox={`0 0 56 ${height}`}
          aria-hidden="true"
        >
          <circle className="ghost" cx={x} cy={node} r="6" />
          <g className="carry">
            <g className="lift">
              <circle className="halo" cx={x} cy={node} r="6" />
              <NodeMark kind={kind} cx={x} cy={node} r={depth > 0 ? 5 : 6} />
            </g>
          </g>
        </svg>
        <span className="row-main">
          <span className="row-line">
            <TypeIcon name={icon} size={depth > 0 ? 14 : 16} label={marked ? label : undefined} />
            <a
              className="ttl row-link"
              href={hashFor(item.id)}
              aria-current={selected ? 'true' : undefined}
              aria-expanded={expanded}
              onClick={(event) => {
                if (!onTap) return;
                event.preventDefault();
                onTap();
              }}
            >
              {item.title}
            </a>
            <RowValues item={item} collection={collection} />
          </span>
          <span className="row-meta">
            {marked && !icon ? <TypeTag name={item.type} label={label} /> : null}
            <span className="row-id">{item.id}</span>
            <span>{item.state}</span>
            {lease ? (
              <span className="row-lease">{holdLabel(lease)}</span>
            ) : depth === 0 ? (
              <span>{ageLabel(item.updatedAt, Date.now())}</span>
            ) : null}
            <Progress item={item} kinds={childKinds} />
            {parent ? <ParentLink parent={parent} /> : null}
          </span>
        </span>
      </div>
      {folds && nesting && onToggleChildren ? (
        <FoldChildren item={item} nesting={nesting} onToggle={onToggleChildren} />
      ) : null}
      {children}
    </li>
  );
}

// The blocks the lanes are laid out from, and the rows the branches hang from. panels: the height
// of each unfolded detail, which its row's block grows by.
function geometryOf(
  sections: NestedSection[],
  nesting: ReadonlyMap<string, RowNesting> | undefined,
  panels: ReadonlyMap<string, number>,
) {
  const blocks: Block[] = [];
  const rows: BranchRow[] = [];
  let top = 0;
  const add = (block: Block) => {
    blocks.push(block);
    top += block.height;
  };
  sections.forEach((section, index) => {
    add({ height: index === 0 ? FIRST_HEAD_H : HEAD_H });
    if (section.items.length === 0) add({ height: EMPTY_H });
    for (const item of section.items) {
      const depth = Math.min(nesting?.get(item.id)?.depth ?? 0, 3);
      const node = depth > 0 ? CHILD_H / 2 : NODE_Y;
      const height = (depth > 0 ? CHILD_H : ROW_H) + (panels.get(item.id) ?? 0);
      rows.push({ top, height, node, x: laneX(item.turn), depth });
      add({
        height,
        turn: item.turn,
        node,
        ...(item.turn === 'none' && section.turn !== 'none' ? { between: true } : {}),
      });
    }
  });
  return { blocks, rows };
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
const NO_CHILDREN: ChildrenOf = () => [];

export function ItemList({
  sections,
  nesting,
  onToggleChildren,
  childrenOf = NO_CHILDREN,
  selectedId,
  collectionOf,
  scope,
  unfolding,
  onTriage,
}: ItemListProps) {
  const list = useSelectedInView(selectedId, unfolding !== undefined);
  const { panel, panels, measured, folded, open } = useUnfolded(selectedId, sections);
  const { blocks, rows } = geometryOf(sections, nesting, unfolding ? panels : NO_PANELS);
  const layout = layoutLanes(blocks);
  const branches = layoutBranches(rows);
  const now = Date.now();
  const kindsOf = (item: Item): NodeKind[] =>
    childrenOf(item.id).map((child) =>
      itemNodeKind(
        child,
        typeOf(collectionOf(child.collection), child.type),
        activeLease(child.lease, now) !== null,
      ),
    );
  const sizes = {
    '--row-h': `${ROW_H}px`,
    '--child-h': `${CHILD_H}px`,
    '--node-y': `${NODE_Y}px`,
    '--head-h': `${HEAD_H}px`,
    '--first-head-h': `${FIRST_HEAD_H}px`,
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
          {branches.map(({ d, yours }) => (
            <path key={d.split(' V')[0]} className={yours ? 'lny br' : 'ln br'} d={d} />
          ))}
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
                  const rowNesting = nesting?.get(item.id);
                  // A selected row that changed hands sits folded in its new place: a tap opens it again.
                  const tap = shows === 'open' ? unfolding?.onFold : () => open(item);
                  return (
                    <ItemRow
                      key={item.id}
                      item={item}
                      x={laneX(item.turn)}
                      selected={selected}
                      collectionOf={collectionOf}
                      childKinds={item.children ? kindsOf(item) : []}
                      nesting={rowNesting}
                      onToggleChildren={
                        onToggleChildren
                          ? () => onToggleChildren(item.id, rowNesting?.settled === true)
                          : undefined
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
