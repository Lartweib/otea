import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { fetchCollections, fetchItem, fetchItems, fetchPresets, fetchSession } from './api.ts';
import { catalogEntries } from './catalog.ts';
import { CollectionRail } from './components/CollectionRail.tsx';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import {
  type ChildrenOf,
  type CollectionOf,
  ItemList,
  type Unfolding,
} from './components/ItemList.tsx';
import { CatalogOverview, ModuleIndex, ModulePanel } from './components/ModuleCatalog.tsx';
import { type IntakeParent, NewItemForm } from './components/NewItemForm.tsx';
import { browserStorage, Divider, useSplit } from './components/Split.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { Triage } from './components/Triage.tsx';
import { type Connection, useHideTier, useLive, usePhone, useRemote, useRoute } from './hooks.ts';
import { keyCommand, keyTargetOf, stepSelection } from './keys.ts';
import { Button, Icon } from './kit/index.ts';
import { MODULES } from './modules/registry.ts';
import {
  COLLAPSED_KEY,
  EXPANDED_KEY,
  type Folds,
  type NestedSection,
  nestSections,
  parentOf,
  type RowNesting,
  readCollapsed,
  toggleFold,
  writeCollapsed,
} from './nesting.ts';
import type { Remote } from './remote.ts';
import { groupByTurn } from './sections.ts';
import { hashFor, ITEMS_HASH, modulesHash, TRIAGE_HASH } from './selection.ts';
import type { CollectionView, Item, ItemView, PresetView } from './types.ts';
import { inCollection, listOrder, railEntries } from './workspace.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message t-small' : 'pane-message action-error'}>{children}</p>;
}

type ListPaneProps = {
  items: Remote<Item[]>;
  sections: NestedSection[];
  nesting: ReadonlyMap<string, RowNesting>;
  onToggleChildren: (id: string, settled: boolean) => void;
  childrenOf: ChildrenOf;
  selectedId: string | undefined;
  collection: string | undefined;
  collectionOf: CollectionOf;
  unfolding: Unfolding | undefined;
  onTriage: (() => void) | undefined;
  sidebar: boolean;
  onToggleSidebar: () => void;
};

// Folds the collections sidebar away (or brings it back): the list keeps its width, the detail
// takes the room.
function SidebarToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const tip = shown ? 'Hide collections · f' : 'Show collections · f';
  return (
    <Button
      variant="quiet"
      size="sm"
      icon
      className="sidebar-toggle tip"
      data-tip={tip}
      aria-label={tip}
      aria-expanded={shown}
      aria-controls="collections"
      aria-keyshortcuts="f"
      onClick={onToggle}
    >
      <Icon name="sidebar" />
    </Button>
  );
}

function ListPane({
  items,
  sections,
  nesting,
  onToggleChildren,
  childrenOf,
  selectedId,
  collection,
  collectionOf,
  unfolding,
  onTriage,
  sidebar,
  onToggleSidebar,
}: ListPaneProps) {
  if (items.status === 'loading') return <Message>Loading…</Message>;
  if (items.status === 'failed') return <Message muted={false}>{items.message}</Message>;
  if (items.value.length === 0) {
    return (
      <Message>
        No items yet. Create one with <code>otea create</code>.
      </Message>
    );
  }
  return (
    <>
      <div className="list-head">
        <SidebarToggle shown={sidebar} onToggle={onToggleSidebar} />
        <h2 className="t-h">{collection ?? 'all items'}</h2>
        <span className="t-cap list-hint">j k to move · f collections</span>
      </div>
      <ItemList
        sections={sections}
        nesting={nesting}
        onToggleChildren={onToggleChildren}
        childrenOf={childrenOf}
        selectedId={selectedId}
        collectionOf={collectionOf}
        scope={collection ?? ''}
        {...(unfolding ? { unfolding } : {})}
        {...(onTriage ? { onTriage } : {})}
      />
    </>
  );
}

type DetailPaneProps = {
  id: string;
  item: Remote<ItemView | null>;
  canWrite: boolean;
  collectionOf: CollectionOf;
  layout?: 'pane' | 'unfold';
  onMoved?: () => void;
  onAddChild?: (parent: ItemView) => void;
};

function DetailPane({
  id,
  item,
  canWrite,
  collectionOf,
  layout,
  onMoved,
  onAddChild,
}: DetailPaneProps) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading') return <Message>Loading…</Message>;
  if (!item.value) return <Message>Item {id} not found.</Message>;
  return (
    <ItemDetail
      item={item.value}
      canWrite={canWrite}
      collection={collectionOf(item.value.collection)}
      collectionOf={collectionOf}
      onAddChild={onAddChild}
      {...(layout ? { layout } : {})}
      {...(onMoved ? { onMoved } : {})}
    />
  );
}

type SelectedItemProps = Omit<DetailPaneProps, 'item'> & {
  version: number;
  connection: Connection;
};

function SelectedItem({ id, version, connection, ...rest }: SelectedItemProps) {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  return <DetailPane id={id} item={useRemote(load, version, connection)} {...rest} />;
}

// A collection's preset decides its fields and which state means "incomplete".
function collectionLookup(collections: Remote<CollectionView[]>): CollectionOf {
  const list = collections.status === 'ready' ? collections.value : [];
  return (name) => list.find((collection) => collection.name === name);
}

function Brand() {
  return (
    <a className="brand" href={ITEMS_HASH} aria-label="otea, all items">
      <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
        <path
          className="brand-fork"
          d="M5 0 V8 C5 14 11 12 11 18 V26 M17 0 V8 C17 14 11 12 11 18"
        />
        <circle className="brand-dot" cx="17" cy="4.5" r="3.5" />
      </svg>
      otea
    </a>
  );
}

type CatalogProps = { name: string | undefined; presets: Remote<PresetView[]> };

// The module catalog: the index on the left, the chosen module (or an overview) on the right.
function Catalog({ name, presets }: CatalogProps) {
  const entries = catalogEntries(MODULES, presets.status === 'ready' ? presets.value : []);
  const entry = entries.find((candidate) => candidate.name === name);
  return (
    <main className="layout">
      <div className="list-pane">
        <ModuleIndex entries={entries} selected={name} />
      </div>
      <div className="detail-pane">
        <div className="detail-panel raised">
          {name === undefined ? (
            <CatalogOverview presets={presets} />
          ) : entry ? (
            <ModulePanel key={entry.name} entry={entry} presets={presets} />
          ) : presets.status === 'loading' ? (
            <Message>Loading…</Message>
          ) : (
            <Message>No module named {name}.</Message>
          )}
        </div>
      </div>
    </main>
  );
}

// parent: the item a "+ child" opened the form for; the form starts in its collection.
type Intake = { openedOn: string | undefined; parent?: IntakeParent };

// The parents this viewer folded (or, whose children are all closed, unfolded) in the list,
// remembered in this browser.
function useFolds(): [Folds, (id: string, settled: boolean) => void] {
  const [folds, setFolds] = useState<Folds>(() => ({
    collapsed: readCollapsed(browserStorage()),
    expanded: readCollapsed(browserStorage(), EXPANDED_KEY),
  }));
  const toggle = useCallback((id: string, settled: boolean) => {
    setFolds((current) => {
      const next = toggleFold(current, id, settled);
      writeCollapsed(browserStorage(), next.collapsed, COLLAPSED_KEY);
      writeCollapsed(browserStorage(), next.expanded, EXPANDED_KEY);
      return next;
    });
  }, []);
  return [folds, toggle];
}

// Each item's children, from every item listed (any collection).
function childrenIndex(items: readonly Item[]): ChildrenOf {
  const index = new Map<string, Item[]>();
  for (const item of items) {
    const parent = parentOf(item);
    if (parent !== undefined) index.set(parent, [...(index.get(parent) ?? []), item]);
  }
  return (id) => index.get(id) ?? [];
}

type WorkspaceKeys = {
  enabled: boolean;
  toggleSidebar: () => void;
  order: string[];
  selectedId: string | undefined;
};

// f folds the collections sidebar, j and k walk the list. Keys typed into a field stay there.
function useWorkspaceKeys({ enabled, toggleSidebar, order, selectedId }: WorkspaceKeys) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const command = keyCommand({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: keyTargetOf(event.target),
      });
      if (!command) return;
      event.preventDefault();
      if (command === 'toggle-sidebar') toggleSidebar();
      else {
        const next = stepSelection(order, selectedId, command === 'next' ? 1 : -1);
        if (next !== undefined && next !== selectedId) window.location.hash = hashFor(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, toggleSidebar, order, selectedId]);
}

export function App() {
  const { connection, version } = useLive();
  const route = useRoute();
  const phone = usePhone();
  const selectedId = route.view === 'items' ? route.id : undefined;
  const items = useRemote(fetchItems, version, connection);
  const session = useRemote(fetchSession, 0, connection);
  const collections = useRemote(fetchCollections, 0, connection);
  const presets = useRemote(fetchPresets, 0, connection);
  const collectionOf = collectionLookup(collections);
  const canWrite = session.status === 'ready' && session.value.canWrite;
  const [intake, setIntake] = useState<Intake>();
  // The split is a way of looking, not a place: it stays out of the hash, so links and history keep
  // pointing at items.
  const split = useSplit();
  const listPane = useHideTier();
  const [collection, setCollection] = useState<string>();
  const allItems = items.status === 'ready' ? items.value : [];
  const [folds, toggleChildren] = useFolds();
  const grouped = groupByTurn(inCollection(allItems, collection));
  const { sections, rows: nesting } = nestSections(grouped, folds, (id) =>
    allItems.find((item) => item.id === id),
  );
  const order = listOrder(sections);
  useWorkspaceKeys({
    enabled: route.view === 'items',
    toggleSidebar: split.toggleSidebar,
    order,
    selectedId,
  });
  const creating =
    canWrite && route.view === 'items' && intake !== undefined && intake.openedOn === selectedId;
  const closeIntake = () => setIntake(undefined);
  const showCreated = (id: string) => {
    closeIntake();
    window.location.hash = hashFor(id);
  };
  const openIntake = () => {
    // From the catalog, intake opens next to the item list (nothing is selected there).
    if (route.view === 'modules') window.location.hash = ITEMS_HASH;
    setIntake({ openedOn: selectedId });
    // On a phone intake opens above the list.
    if (phone) window.scrollTo({ top: 0 });
  };
  const addChild = (parent: ItemView) => {
    const { id, title } = parent;
    setIntake({ openedOn: selectedId, parent: { id, title, collection: parent.collection } });
    if (phone) window.scrollTo({ top: 0 });
  };
  const names = collections.status === 'ready' ? collections.value.map((each) => each.name) : [];
  const rail = railEntries(names, allItems);
  // On a phone the selected row unfolds into its detail, and the detail pane only holds intake.
  // A move made from the unfolded item folds it, and the row carries itself home.
  const fold = () => {
    window.location.hash = ITEMS_HASH;
  };
  const unfolding: Unfolding | undefined =
    phone && !creating
      ? {
          detail: (id) => (
            <SelectedItem
              key={id}
              id={id}
              version={version}
              connection={connection}
              canWrite={canWrite}
              collectionOf={collectionOf}
              layout="unfold"
              onMoved={fold}
              onAddChild={addChild}
            />
          ),
          onFold: fold,
        }
      : undefined;
  const openTriage = canWrite
    ? () => {
        window.location.hash = TRIAGE_HASH;
      }
    : undefined;
  const leaveTriage = () => {
    window.location.hash = ITEMS_HASH;
  };
  // Triage takes everything that waits for you, folded under a parent or not.
  const waiting = grouped.find((section) => section.turn === 'human')?.items ?? [];
  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <ConnectionBadge connection={connection} />
          <a
            className="topbar-link"
            href={modulesHash()}
            aria-current={route.view === 'modules' ? 'page' : undefined}
          >
            <Icon name="modules" />
            <span className="topbar-label">Modules</span>
          </a>
          <ThemeToggle />
          {canWrite ? (
            <Button size="sm" className="topbar-new" aria-pressed={creating} onClick={openIntake}>
              <Icon name="plus" />
              <span className="topbar-label">New item</span>
            </Button>
          ) : null}
        </div>
      </header>
      {route.view === 'modules' ? (
        <Catalog name={route.name} presets={presets} />
      ) : route.view === 'triage' && canWrite ? (
        <main className="layout triage-layout">
          <Triage
            waiting={waiting}
            collectionOf={collectionOf}
            version={version}
            connection={connection}
            onExit={leaveTriage}
          />
        </main>
      ) : (
        <main
          className="layout workspace"
          ref={split.workspace}
          data-sidebar={split.sidebar ? 'on' : 'off'}
          style={split.style}
        >
          <CollectionRail
            entries={rail}
            yoursTotal={rail.reduce((sum, entry) => sum + entry.yours, 0)}
            openTotal={rail.reduce((sum, entry) => sum + entry.open, 0)}
            selected={collection}
            onSelect={setCollection}
            hidden={!split.sidebar && !phone}
          />
          <div className="list-pane" data-pane="list" ref={listPane}>
            <ListPane
              items={items}
              sections={sections}
              nesting={nesting}
              onToggleChildren={toggleChildren}
              childrenOf={childrenIndex(allItems)}
              selectedId={selectedId}
              collection={collection}
              collectionOf={collectionOf}
              unfolding={unfolding}
              onTriage={openTriage}
              sidebar={split.sidebar}
              onToggleSidebar={split.toggleSidebar}
            />
          </div>
          {phone ? null : (
            <Divider workspace={split.workspace} width={split.width} onCommit={split.commitWidth} />
          )}
          {phone && !creating ? null : (
            <div className="detail-pane" data-pane="detail">
              <div className="detail-panel">
                {creating ? (
                  <NewItemForm
                    key={intake?.parent?.id ?? 'new'}
                    connection={connection}
                    parent={intake?.parent}
                    onCancel={closeIntake}
                    onCreated={showCreated}
                  />
                ) : selectedId ? (
                  <SelectedItem
                    key={selectedId}
                    id={selectedId}
                    version={version}
                    connection={connection}
                    canWrite={canWrite}
                    collectionOf={collectionOf}
                    onAddChild={addChild}
                  />
                ) : (
                  <Message>Select an item to see its details.</Message>
                )}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
