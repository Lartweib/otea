import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { fetchCollections, fetchItem, fetchItems, fetchPresets, fetchSession } from './api.ts';
import { catalogEntries } from './catalog.ts';
import { CollectionRail } from './components/CollectionRail.tsx';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { FocusToggle } from './components/FocusToggle.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import { type CollectionOf, ItemList } from './components/ItemList.tsx';
import { CatalogOverview, ModuleIndex, ModulePanel } from './components/ModuleCatalog.tsx';
import { NewItemForm } from './components/NewItemForm.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { type Connection, useLive, useRemote, useRoute } from './hooks.ts';
import { keyCommand, keyTargetOf, stepSelection } from './keys.ts';
import { Button, Icon } from './kit/index.ts';
import { MODULES } from './modules/registry.ts';
import type { Remote } from './remote.ts';
import { groupByTurn, type Section } from './sections.ts';
import { hashFor, ITEMS_HASH, modulesHash } from './selection.ts';
import type { CollectionView, Item, ItemView, PresetView } from './types.ts';
import { inCollection, listOrder, railEntries } from './workspace.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message t-small' : 'pane-message action-error'}>{children}</p>;
}

type ListPaneProps = {
  items: Remote<Item[]>;
  sections: Section[];
  selectedId: string | undefined;
  collection: string | undefined;
  collectionOf: CollectionOf;
};

function ListPane({ items, sections, selectedId, collection, collectionOf }: ListPaneProps) {
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
        <h2 className="t-h">{collection ?? 'all items'}</h2>
        <span className="t-cap list-hint">j k to move · f to expand</span>
      </div>
      <ItemList
        sections={sections}
        selectedId={selectedId}
        collectionOf={collectionOf}
        scope={collection ?? ''}
      />
    </>
  );
}

type DetailPaneProps = {
  id: string;
  item: Remote<ItemView | null>;
  canWrite: boolean;
  collectionOf: CollectionOf;
  headAction: ReactNode;
};

function DetailPane({ id, item, canWrite, collectionOf, headAction }: DetailPaneProps) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading') return <Message>Loading…</Message>;
  if (!item.value) return <Message>Item {id} not found.</Message>;
  return (
    <ItemDetail
      item={item.value}
      canWrite={canWrite}
      collection={collectionOf(item.value.collection)}
      headAction={headAction}
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

type Intake = { openedOn: string | undefined };

type WorkspaceKeys = {
  enabled: boolean;
  focus: boolean;
  setFocus: (update: (focus: boolean) => boolean) => void;
  order: string[];
  selectedId: string | undefined;
};

// f toggles focus mode, Escape leaves it, j and k walk the list. Keys typed into a field stay there.
function useWorkspaceKeys({ enabled, focus, setFocus, order, selectedId }: WorkspaceKeys) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const command = keyCommand(
        {
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          target: keyTargetOf(event.target),
        },
        { focus },
      );
      if (!command) return;
      event.preventDefault();
      if (command === 'toggle-focus') setFocus((current) => !current);
      else if (command === 'leave-focus') setFocus(() => false);
      else {
        const next = stepSelection(order, selectedId, command === 'next' ? 1 : -1);
        if (next !== undefined && next !== selectedId) window.location.hash = hashFor(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, focus, setFocus, order, selectedId]);
}

export function App() {
  const { connection, version } = useLive();
  const route = useRoute();
  const selectedId = route.view === 'items' ? route.id : undefined;
  const items = useRemote(fetchItems, version, connection);
  const session = useRemote(fetchSession, 0, connection);
  const collections = useRemote(fetchCollections, 0, connection);
  const presets = useRemote(fetchPresets, 0, connection);
  const collectionOf = collectionLookup(collections);
  const canWrite = session.status === 'ready' && session.value.canWrite;
  const [intake, setIntake] = useState<Intake>();
  // Focus mode is a way of looking, not a place: it stays out of the hash, so links and history
  // keep pointing at items.
  const [focus, setFocus] = useState(false);
  const [collection, setCollection] = useState<string>();
  const allItems = items.status === 'ready' ? items.value : [];
  const sections = groupByTurn(inCollection(allItems, collection));
  const order = listOrder(sections);
  useWorkspaceKeys({ enabled: route.view === 'items', focus, setFocus, order, selectedId });
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
  };
  const toggle = <FocusToggle focus={focus} onToggle={() => setFocus((current) => !current)} />;
  const names = collections.status === 'ready' ? collections.value.map((each) => each.name) : [];
  const rail = railEntries(names, allItems);
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
            Modules
          </a>
          <ThemeToggle />
          {canWrite ? (
            <Button size="sm" aria-pressed={creating} onClick={openIntake}>
              <Icon name="plus" />
              New item
            </Button>
          ) : null}
        </div>
      </header>
      {route.view === 'modules' ? (
        <Catalog name={route.name} presets={presets} />
      ) : (
        <main className="layout workspace" data-focus={focus}>
          <CollectionRail
            entries={rail}
            yoursTotal={rail.reduce((sum, entry) => sum + entry.yours, 0)}
            openTotal={rail.reduce((sum, entry) => sum + entry.open, 0)}
            selected={collection}
            onSelect={setCollection}
            hidden={focus}
          />
          <div className="list-pane">
            <ListPane
              items={items}
              sections={sections}
              selectedId={selectedId}
              collection={collection}
              collectionOf={collectionOf}
            />
          </div>
          <div className="detail-pane">
            <div className="detail-panel raised">
              {creating ? (
                <NewItemForm
                  connection={connection}
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
                  headAction={toggle}
                />
              ) : (
                <Message>Select an item to see its details.</Message>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
