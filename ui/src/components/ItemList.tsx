import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ageLabel, untilLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { rowValues, showsTypes, typeOf } from '../item-types.ts';
import { AgentMark, Button, Icon, NodeMark } from '../kit/index.ts';
import {
  type Block,
  type BranchPiece,
  branchPieces,
  type LaneLayout,
  laneX,
  layoutLanes,
  type TreeRow,
} from '../lanes.ts';
import { activeLease } from '../lease.ts';
import { moduleFor } from '../modules/registry.ts';
import { reducedMotion } from '../motion.ts';
import type { NestedSection, ParentRef, RowNesting } from '../nesting.ts';
import { itemNodeKind, type NodeKind } from '../node-kind.ts';
import { openLabel } from '../relations.ts';
import { GRID, MAX_DEPTH, ROW } from '../row-grid.ts';
import { hashFor } from '../selection.ts';
import type { CollectionView, Item, Lease } from '../types.ts';
import { afterFold, panelOf, reopen, select, type UnfoldState } from '../unfold.ts';
import { Carry } from './Carry.tsx';
import { ChildBar } from './relations/ChildBar.tsx';
import { measureTree, runTree, type Tree, type TreeRun } from './tree-draw.ts';
import { Unfold } from './Unfold.tsx';

// Fixed heights keep the lane geometry and the rows in step (row heights live in row-grid.ts).
const HEAD_H = 60;
const FIRST_HEAD_H = 34;
const EMPTY_H = 40;
// Lines of a row: the lanes in the rail, and the branch, which reaches past it to the deepest slot.
const LINES_W = 200;

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

// Where a block sits in the list, for the piece of the lanes it draws.
type Place = { top: number; height: number };

// Where a row sits, how deep it nests, and its piece of the branch.
type RowPlace = Place & { depth: number; node: number; pieces: BranchPiece[] };

type ItemRowProps = {
  item: Item;
  selected: boolean;
  x: number;
  place: RowPlace;
  lanes: LaneLayout;
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

// The lines a block of the list draws: its slice of the lanes, and for a row its piece of the
// branch. Lines live in the blocks they cross, so a block that moves carries its own.
function Lines({
  lanes,
  place,
  width = GRID.rail,
  pieces = [],
}: {
  lanes: LaneLayout;
  place: Place;
  width?: number;
  pieces?: BranchPiece[];
}) {
  const { top, height } = place;
  return (
    <svg
      className="row-lines"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <g transform={`translate(0 ${-top})`}>
        <path className="ln" d={lanes.agentLane} />
        <path className="lny" d={lanes.youLane} />
        <path className="ln" d={lanes.trunk} />
      </g>
      {pieces.map((piece) => (
        <path
          key={`${piece.kind}${piece.level}`}
          className="br"
          d={piece.d}
          pathLength={1}
          data-lv={piece.level}
          data-y0={piece.y0}
          data-y1={piece.y1}
        />
      ))}
    </svg>
  );
}

// What each field module of the type's row slot puts in the row, by column: priority has its own,
// everything else is a signal at the end of line two. Most modules put nothing.
function rowMarks(item: Item, collection: CollectionView | undefined) {
  const type = typeOf(collection, item.type);
  const priority: ReactNode[] = [];
  const signals: ReactNode[] = [];
  for (const { field, value } of rowValues(type, item.fields)) {
    const { Row, rowColumn } = moduleFor(field.module);
    if (!Row) continue;
    const mark = <Row key={field.name} field={field} value={value} />;
    if (rowColumn === 'priority') priority.push(mark);
    else signals.push(mark);
  }
  return { priority, signals };
}

// A parent's children at a glance: one segment each, and how many are still open.
function Progress({ item, kinds }: { item: Item; kinds: NodeKind[] }) {
  const summary = item.children;
  if (!summary || kinds.length === 0) return null;
  return (
    <span className="row-progress">
      <ChildBar kinds={kinds} size="sm" />
      <span className="row-progress-count" title={openLabel(summary)}>
        {summary.open}
        <span className="row-progress-of"> of {summary.total}</span> open
      </span>
    </span>
  );
}

// Folds or unfolds the children nested under a parent.
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
      className="row-fold-button"
      aria-expanded={!folded}
      aria-label={`${folded ? 'Show' : 'Fold'} the ${nesting.nested} children of ${item.id}`}
      title={`${nesting.nested} ${nesting.nested === 1 ? 'child' : 'children'}`}
      data-folded={folded || undefined}
      onClick={onToggle}
    >
      <Icon name="chevron" />
    </button>
  );
}

// The type slot is always reserved: the type's icon, or a small filled square for a type without
// one.
function TypeSlot({ icon, label, small }: { icon?: string; label?: string; small: boolean }) {
  if (icon !== undefined) return <TypeIcon name={icon} size={small ? 14 : 16} label={label} />;
  return label === undefined ? (
    <i className="row-mark" aria-hidden="true" />
  ) : (
    <i className="row-mark" role="img" aria-label={label} title={label} />
  );
}

// The parent of a row listed in another group, as a muted breadcrumb before its title
// (`Create wolf › Movement`): it truncates first, and selects the parent.
function ParentCrumb({ parent }: { parent: ParentRef }) {
  return (
    <>
      <a className="row-crumb" href={hashFor(parent.id)} title={`Child of ${parent.id}`}>
        {parent.title ?? parent.id}
      </a>
      <span className="row-crumb-sep" aria-hidden="true">
        ›
      </span>
    </>
  );
}

// Who and when, in two fixed columns aligned on the dot between them: the agent holding the item
// and until when, or, held by nobody, an empty who and how long ago it last changed.
function WhoWhen({ item, lease }: { item: Item; lease: Lease | null }) {
  const holder = lease?.holder;
  return (
    <>
      <span className="row-who">
        <i className="row-wf" aria-hidden="true" />
        {holder === 'you' ? (
          <>
            <span className="row-holder" data-you>
              {holder}
            </span>
            <span className="row-mono" data-you title={holder}>
              {holder}
            </span>
          </>
        ) : holder ? (
          <>
            <AgentMark name={holder} className="row-agent" decorative />
            <span className="row-holder" title={holder}>
              {holder}
            </span>
          </>
        ) : null}
      </span>
      <span className="row-when" data-nobody={holder ? undefined : true}>
        {lease ? untilLabel(lease) : ageLabel(item.updatedAt, Date.now())}
      </span>
    </>
  );
}

function ItemRow({
  item,
  selected,
  x,
  place,
  lanes,
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
  const { depth, node } = place;
  const height = depth > 0 ? ROW.child.height : ROW.top.height;
  const folds = nesting?.nested !== undefined && onToggleChildren !== undefined;
  const label = showsTypes(collection) ? (type?.label ?? item.type) : undefined;
  const parent = depth === 0 ? nesting?.parent : undefined;
  const { priority, signals } = rowMarks(item, collection);
  return (
    <li
      data-flip={item.id}
      data-turn={item.turn}
      data-x={x}
      data-depth={depth}
      data-node={node}
      data-folds={folds || undefined}
    >
      <Lines lanes={lanes} place={place} width={LINES_W} pieces={place.pieces} />
      {/* The title is the row's link, stretched over the whole row; the parent breadcrumb and the
          fold button sit above it. */}
      <div
        className="row"
        data-kind={kind}
        data-depth={depth > 0 ? depth : undefined}
        data-current={selected || undefined}
        data-expanded={expanded || undefined}
        style={{ '--ind': `${GRID.step * depth}px` } as CSSProperties}
      >
        <svg
          className="row-node"
          width={GRID.rail}
          height={height}
          viewBox={`0 0 ${GRID.rail} ${height}`}
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
        <span className="row-fold">
          {folds && nesting && onToggleChildren ? (
            <FoldChildren item={item} nesting={nesting} onToggle={onToggleChildren} />
          ) : null}
        </span>
        <span className="row-type">
          <TypeSlot
            small={depth > 0}
            {...(type?.icon !== undefined ? { icon: type.icon } : {})}
            {...(label !== undefined ? { label } : {})}
          />
        </span>
        <span className="row-t1">
          {parent ? <ParentCrumb parent={parent} /> : null}
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
          <i className="row-lead" aria-hidden="true" />
        </span>
        <span className="row-t2">
          <span className="row-id">{item.id}</span>
          <span className="row-state">{item.state}</span>
          <Progress item={item} kinds={childKinds} />
          {signals.length > 0 ? <span className="row-values">{signals}</span> : null}
        </span>
        <span className="row-pri" data-empty={priority.length === 0 || undefined}>
          {priority}
        </span>
        <WhoWhen item={item} lease={lease} />
      </div>
      {children}
    </li>
  );
}

const depthOf = (nesting: ReadonlyMap<string, RowNesting> | undefined, id: string) =>
  Math.min(nesting?.get(id)?.depth ?? 0, MAX_DEPTH);

// Where every block of the list sits, the lanes laid out over all of them, and each row's piece of
// the branch. panels: the height of each unfolded detail, which its row's block grows by.
function geometryOf(
  sections: NestedSection[],
  nesting: ReadonlyMap<string, RowNesting> | undefined,
  panels: ReadonlyMap<string, number>,
) {
  const blocks: Block[] = [];
  const heads = new Map<string, Place>();
  const empties = new Map<string, Place>();
  const rows = new Map<string, RowPlace>();
  let top = 0;
  const add = (block: Block): Place => {
    const place = { top, height: block.height };
    blocks.push(block);
    top += block.height;
    return place;
  };
  sections.forEach((section, index) => {
    heads.set(section.turn, add({ height: index === 0 ? FIRST_HEAD_H : HEAD_H }));
    if (section.items.length === 0) empties.set(section.turn, add({ height: EMPTY_H }));
    const tree: TreeRow[] = [];
    const placed: (Place & { depth: number; node: number })[] = [];
    for (const item of section.items) {
      const depth = depthOf(nesting, item.id);
      const size = depth > 0 ? ROW.child : ROW.top;
      const panel = panels.get(item.id) ?? 0;
      const height = size.height + panel;
      const place = add({
        height,
        turn: item.turn,
        node: size.node,
        ...(item.turn === 'none' && section.turn !== 'none' ? { between: true } : {}),
      });
      const row = nesting?.get(item.id);
      tree.push({ depth, height, node: size.node, opens: row?.collapsed === false, panel });
      placed.push({ ...place, depth, node: size.node });
    }
    const pieces = branchPieces(tree);
    section.items.forEach((item, at) => {
      const place = placed[at];
      if (place) rows.set(item.id, { ...place, pieces: pieces[at] ?? [] });
    });
  });
  return { lanes: layoutLanes(blocks), heads, empties, rows };
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
    window.scrollTo({ top: pageTop(row) - 8, behavior: reducedMotion() ? 'instant' : 'smooth' });
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

// A fold or unfold on its way: the change waits for React to render it (unfold), or the tree has
// been drawn back up and its rows wait to be dropped (fold).
type Pending = { id: string; kind: 'unfold' } | { id: string; kind: 'fold'; tree: Tree };

type Drawing = { id: string; tree: Tree; run: TreeRun; folding: boolean; settled: boolean };

// Folding and unfolding a parent's children with the tree draw. The change itself is the viewer's
// folds (onToggle); while the tree draws, the list's own FLIP (Carry) stands still, since the rows
// after the block ride on the line's head instead.
function useTreeDraw(
  list: RefObject<HTMLElement | null>,
  nesting: ReadonlyMap<string, RowNesting> | undefined,
  onToggle: ((id: string, settled: boolean) => void) | undefined,
) {
  const still = useRef(false);
  const pending = useRef<Pending | undefined>(undefined);
  const drawing = useRef<Drawing | undefined>(undefined);

  const rowOf = (id: string) =>
    list.current?.querySelector<HTMLElement>(`li[data-flip="${CSS.escape(id)}"]`) ?? null;

  const commit = (id: string, settled: boolean, next: Pending) => {
    pending.current = next;
    still.current = true;
    onToggle?.(id, settled);
  };

  // Draws the tree from where its head is to an end; folding, the rows are dropped once it is in.
  const draw = (id: string, tree: Tree, from: number, folding: boolean, settled: boolean) => {
    const parent = rowOf(id);
    if (folding) parent?.setAttribute('data-folding', '');
    else parent?.removeAttribute('data-folding');
    const run = runTree(tree, from, folding ? tree.start : tree.end, folding, () => {
      drawing.current = undefined;
      if (folding) commit(id, settled, { id, kind: 'fold', tree });
      else tree.clear();
    });
    drawing.current = { id, tree, run, folding, settled };
  };

  const toggle = (id: string, settled: boolean) => {
    if (!onToggle || pending.current) return;
    const current = drawing.current;
    if (current) {
      if (current.id !== id) return;
      // Interrupted: the head turns back from where it is.
      current.run.stop();
      draw(id, current.tree, current.run.head(), !current.folding, settled);
      return;
    }
    const open = nesting?.get(id)?.collapsed === false;
    const parent = rowOf(id);
    const root = list.current;
    if (reducedMotion() || !parent || !root) {
      // Reduced motion: the list's own motion crossfades the children in, and folds at once.
      onToggle(id, settled);
      return;
    }
    if (!open) {
      commit(id, settled, { id, kind: 'unfold' });
      return;
    }
    const tree = measureTree(parent, root);
    if (!tree) {
      onToggle(id, settled);
      return;
    }
    draw(id, tree, tree.end, true, settled);
  };

  // After the render that showed or dropped the children, before it is painted.
  useLayoutEffect(() => {
    const next = pending.current;
    if (!next) return;
    const open = nesting?.get(next.id)?.collapsed === false;
    if (next.kind === 'fold') {
      if (open) return;
      pending.current = undefined;
      still.current = false;
      next.tree.clear();
      rowOf(next.id)?.removeAttribute('data-folding');
      return;
    }
    if (!open) return;
    pending.current = undefined;
    still.current = false;
    const parent = rowOf(next.id);
    const root = list.current;
    const tree = parent && root ? measureTree(parent, root) : undefined;
    if (tree) draw(next.id, tree, tree.start, false, nesting?.get(next.id)?.settled === true);
  });

  useEffect(() => () => drawing.current?.run.stop(), []);

  return { toggle, still };
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
const NO_PLACE: RowPlace = { top: 0, height: ROW.top.height, depth: 0, node: 0, pieces: [] };

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
  const { lanes, heads, empties, rows } = geometryOf(
    sections,
    nesting,
    unfolding ? panels : NO_PANELS,
  );
  const tree = useTreeDraw(list, nesting, onToggleChildren);
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
    '--head-h': `${HEAD_H}px`,
    '--first-head-h': `${FIRST_HEAD_H}px`,
    '--empty-h': `${EMPTY_H}px`,
  } as CSSProperties;
  return (
    <nav className="item-list" aria-label="Items" style={sizes} ref={list}>
      <Carry scope={scope} className="lanes-body" still={tree.still}>
        {sections.map((section) => (
          <section key={section.turn} className="section" data-turn={section.turn}>
            <h2 className="section-title" data-flip={`head:${section.turn}`}>
              <Lines lanes={lanes} place={heads.get(section.turn) ?? NO_PLACE} />
              {section.title}
              <span className="count">{section.total}</span>
              {section.turn === 'human' && section.items.length > 0 && onTriage ? (
                <TriageOpen onTriage={onTriage} />
              ) : null}
            </h2>
            {section.items.length === 0 ? (
              <p className="section-empty" data-flip={`empty:${section.turn}`}>
                <Lines lanes={lanes} place={empties.get(section.turn) ?? NO_PLACE} />
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
                      place={rows.get(item.id) ?? NO_PLACE}
                      lanes={lanes}
                      selected={selected}
                      collectionOf={collectionOf}
                      childKinds={item.children ? kindsOf(item) : []}
                      nesting={rowNesting}
                      onToggleChildren={
                        onToggleChildren
                          ? () => tree.toggle(item.id, rowNesting?.settled === true)
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
