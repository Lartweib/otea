import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type Filters,
  filterItems,
  type GridColumn,
  gridColumns,
  gridTemplate,
  gridTier,
  nextSort,
  type Sort,
  shownColumns,
  sortItems,
} from '../grid.ts';
import { Button } from '../kit/index.ts';
import { MOTION, reducedMotion } from '../motion.ts';
import { type Folds, nestSections } from '../nesting.ts';
import type { Remote } from '../remote.ts';
import { groupItems, groupings, type Section } from '../sections.ts';
import type { CollectionView, Item } from '../types.ts';
import type { ViewMode, ViewPrefs } from '../view-prefs.ts';
import { BulkBar } from './BulkBar.tsx';
import { FilterTokens, GridMenu, HeadControls, type OpenMenu } from './GridControls.tsx';
import { ItemGrid } from './ItemGrid.tsx';
import { type ChildrenOf, type CollectionOf, ItemList, type Unfolding } from './ItemList.tsx';
import { type MorphRun, morphEngine, runMorph } from './morph-engine.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message t-small' : 'pane-message action-error'}>{children}</p>;
}

// The pane's width, as it resizes: the grid's tier follows it (dragging the divider, the detail
// opening, a smaller window).
function useWidth() {
  const [width, setWidth] = useState(0);
  const attach = useCallback((element: HTMLElement | null) => {
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { attach, width, setWidth };
}

// The selection is the collection's: ids the viewer ticked, kept while they stay shown.
function useChecked(shown: readonly string[]) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | undefined>(undefined);
  const visible = new Set(shown);
  const live = new Set([...checked].filter((id) => visible.has(id)));
  const toggle = (id: string, range: boolean) => {
    const next = new Set(live);
    const from = anchor.current === undefined ? -1 : shown.indexOf(anchor.current);
    if (range && from >= 0) {
      const to = shown.indexOf(id);
      for (const each of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(each);
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    anchor.current = id;
    setChecked(next);
  };
  const all = () => setChecked(live.size === shown.length ? new Set() : new Set(shown));
  return { checked: live, toggle, all, set: (ids: string[]) => setChecked(new Set(ids)) };
}

type ListPaneProps = {
  items: Remote<Item[]>;
  // The items in the list's scope, and every item (for parents in other collections).
  scoped: readonly Item[];
  allItems: readonly Item[];
  folds: Folds;
  onToggleChildren: (id: string, settled: boolean) => void;
  childrenOf: ChildrenOf;
  selectedId: string | undefined;
  collection: CollectionView | undefined;
  collectionName: string | undefined;
  collectionOf: CollectionOf;
  unfolding: Unfolding | undefined;
  onTriage: (() => void) | undefined;
  canWrite: boolean;
  phone: boolean;
  // The collection's view choices (none for all items) and how to change them.
  prefs: ViewPrefs | undefined;
  onPrefs: (prefs: Partial<ViewPrefs>) => void;
  // While the views morph, the workspace keeps the grid's room.
  onMorphing: (morphing: boolean) => void;
  // How wide the list is beside the detail, for the list's layer while they morph, and how wide
  // the grid's pane is, to know before switching whether a table fits.
  listWidth: number;
  gridWidth: number;
};

// The list pane: its head (the lane names, the title, and for a collection its grouping, filters and
// the switch between list and grid), then the list or the grid, and the bar of bulk moves under a
// selection. Switching views morphs one into the other.
export function ListPane(props: ListPaneProps) {
  const { items, scoped, collection, collectionName, prefs, onPrefs, phone } = props;
  const { attach: attachWidth, width, setWidth } = useWidth();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const layers = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLElement | null>(null);
  const run = useRef<MorphRun | undefined>(undefined);
  // The direction of a morph waiting for both views to be laid out.
  const pendingDir = useRef<1 | -1 | undefined>(undefined);
  // The view on screen: during a morph both are drawn.
  const [drawn, setDrawn] = useState<ViewMode | 'both'>(prefs?.mode ?? 'list');
  const mode: ViewMode = phone ? 'list' : (prefs?.mode ?? 'list');
  const columns: GridColumn[] = collection ? gridColumns(collection) : [];
  const group = prefs?.group ?? 'turn';
  const sort: Sort = prefs?.sort ?? null;
  const filters: Filters = prefs?.filters ?? {};
  const shownItems = sortItems(filterItems(scoped, filters), sort, columns);
  const sections: Section[] = groupItems(shownItems, group, collection);
  const severityGroups =
    collection?.types[0]?.fields.find(({ name }) => name === group)?.module === 'severity';
  const nested = nestSections(sections, props.folds, (id) =>
    props.allItems.find((item) => item.id === id),
  );
  const ids = sections.flatMap((section) => section.items.map(({ id }) => id));
  const selection = useChecked(prefs ? ids : []);
  const tier = gridTier(width);
  // Under 640px the table is no longer a table: the pane draws the list, with what the grid was set to.
  const gridFits = tier < 5;
  const view: ViewMode = mode === 'grid' && gridFits ? 'grid' : 'list';
  const shown = shownColumns(columns, tier === 5 ? 4 : tier);
  // The pane scrolls; the view measures its own width.
  const attach = useCallback(
    (element: HTMLElement | null) => {
      pane.current = element?.closest<HTMLElement>('.list-pane') ?? null;
      return attachWidth(element);
    },
    [attachWidth],
  );
  const closeMenu = useCallback((focus: boolean) => {
    setMenu((open) => {
      if (focus) open?.anchor.focus();
      return null;
    });
  }, []);

  // Follow a change of view made elsewhere (another collection, a narrower pane) without a morph.
  useLayoutEffect(() => {
    if (run.current || pendingDir.current !== undefined) return;
    setDrawn(view);
  }, [view]);

  const switchTo = (next: ViewMode) => {
    if (!prefs) return;
    setMenu(null);
    const current = run.current;
    if (current) {
      // Midway: the clock turns around from where it is.
      current.dir = next === 'grid' ? 1 : -1;
      if (next !== prefs.mode) onPrefs({ mode: next });
      return;
    }
    if (next === prefs.mode) return;
    // Both ends must draw a table for the views to morph; otherwise the list stays (or a fade).
    const fits = gridTier(next === 'grid' ? props.gridWidth : width) < 5;
    if (!fits || reducedMotion()) {
      onPrefs({ mode: next });
      layers.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: MOTION.fast,
        easing: 'linear',
      });
      return;
    }
    pendingDir.current = next === 'grid' ? 1 : -1;
    props.onMorphing(true);
    onPrefs({ mode: next });
    setDrawn('both');
  };

  // Both views are laid out: once the grid has its width (the workspace just gave it the grid's
  // room), measure them and run the clock.
  useLayoutEffect(() => {
    const dir = pendingDir.current;
    const root = layers.current;
    const scroller = pane.current;
    if (drawn !== 'both' || dir === undefined || !root || !scroller) return;
    const live = root.parentElement?.clientWidth ?? width;
    if (live !== width) {
      setWidth(live);
      return;
    }
    pendingDir.current = undefined;
    const engine = morphEngine(root, scroller);
    engine.measure();
    run.current = runMorph(engine, dir, (end) => {
      run.current = undefined;
      setDrawn(end > 0 ? 'grid' : 'list');
      props.onMorphing(false);
    });
  });

  useEffect(() => () => run.current?.stop(), []);

  if (items.status === 'loading') return <Message>Loading…</Message>;
  if (items.status === 'failed') return <Message muted={false}>{items.message}</Message>;
  if (items.value.length === 0) {
    return (
      <Message>
        No items yet. Create one with <code>otea create</code>.
      </Message>
    );
  }

  const setSort = (next: Sort) => {
    setMenu(null);
    onPrefs({ sort: next });
  };
  const setFilter = (key: string, values: string[]) => {
    const next: Record<string, readonly string[]> = { ...filters, [key]: values };
    if (values.length === 0) delete next[key];
    onPrefs({ filters: next });
  };
  const presetGroup =
    collection && groupings(collection).includes(collection.view.groupBy)
      ? collection.view.groupBy
      : 'turn';
  const empty = shownItems.length === 0 && scoped.length > 0;
  const showList = drawn === 'list' || drawn === 'both';
  const showGrid = (drawn === 'grid' || drawn === 'both') && collection !== undefined;
  const morphing = drawn === 'both';
  const selected = scoped.filter((item) => selection.checked.has(item.id));
  const count =
    shownItems.length === scoped.length
      ? `${scoped.length}`
      : `${shownItems.length} of ${scoped.length}`;
  const sortColumn = sort ? columns.find(({ key }) => key === sort.key) : undefined;
  return (
    <div className="list-view" ref={attach} data-narrow={width < 760 || undefined}>
      {/* One row: the lane names over their lanes, the title over the row titles, the tools. */}
      <div className="list-head" data-view={view}>
        <span className="lane-names" aria-hidden="true">
          <span>ag</span>
          <span className="lane-names-you">you</span>
        </span>
        <h2 className="t-h">{collectionName ?? 'All items'}</h2>
        {prefs ? (
          <>
            <span className="list-count t-cap">{count}</span>
            {sortColumn && sort ? (
              <span className="list-count t-cap">
                sorted by {sortColumn.label} {sort.dir === 'asc' ? '↑' : '↓'}
              </span>
            ) : null}
            <HeadControls
              group={group}
              presetGroup={presetGroup}
              menu={menu}
              onMenu={setMenu}
              mode={phone ? undefined : mode}
              onMode={switchTo}
            />
          </>
        ) : null}
      </div>
      {prefs ? (
        <FilterTokens
          filters={filters}
          columns={columns}
          onOpen={(key, anchor) => setMenu({ kind: 'column', key, anchor })}
          onClear={(key) => setFilter(key, [])}
          onClearAll={() => onPrefs({ filters: {} })}
        />
      ) : null}
      {empty ? (
        <p className="list-empty t-small">
          Nothing matches these filters.
          <Button size="sm" onClick={() => onPrefs({ filters: {} })}>
            clear filters
          </Button>
        </p>
      ) : (
        <div
          ref={layers}
          className="view-layers"
          data-drawn={drawn}
          style={{ '--list-layer-w': `${props.listWidth}px` } as CSSProperties}
        >
          {showList ? (
            <div className="view-layer" data-layer="list" aria-hidden={morphing && view === 'grid'}>
              <ItemList
                sections={nested.sections}
                nesting={nested.rows}
                onToggleChildren={props.onToggleChildren}
                childrenOf={props.childrenOf}
                selectedId={props.selectedId}
                collectionOf={props.collectionOf}
                scope={`${collectionName ?? ''}:${group}`}
                severityGroups={severityGroups}
                {...(props.unfolding ? { unfolding: props.unfolding } : {})}
                {...(props.onTriage && group === 'turn' ? { onTriage: props.onTriage } : {})}
              />
            </div>
          ) : null}
          {showGrid ? (
            <div className="view-layer" data-layer="grid" aria-hidden={morphing && view === 'list'}>
              <ItemGrid
                sections={sections}
                collection={collection}
                shown={shown}
                template={gridTemplate(shown)}
                sort={sort}
                menu={menu?.kind === 'column' ? menu.key : undefined}
                onSort={(column) => setSort(nextSort(sort, column))}
                onMenu={(column, anchor) =>
                  setMenu(
                    menu?.kind === 'column' && menu.key === column.key
                      ? null
                      : { kind: 'column', key: column.key, anchor },
                  )
                }
                checked={selection.checked}
                onCheck={selection.toggle}
                onCheckAll={selection.all}
                selectedId={props.selectedId}
                scope={`${collectionName ?? ''}:${group}`}
                severityGroups={severityGroups}
              />
            </div>
          ) : null}
        </div>
      )}
      {prefs && view === 'grid' ? (
        <BulkBar
          selected={selected}
          canWrite={props.canWrite}
          onKeep={selection.set}
          onClear={() => selection.set([])}
        />
      ) : null}
      {menu && collection ? (
        <GridMenu
          menu={menu}
          columns={columns}
          items={scoped}
          groupings={groupings(collection)}
          presetGroup={presetGroup}
          group={group}
          sort={sort}
          filters={filters}
          onSort={setSort}
          onGroup={(next) => {
            setMenu(null);
            onPrefs({ group: next });
          }}
          onFilter={setFilter}
          onOpen={setMenu}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}
