import { type ReactNode, useCallback, useState } from 'react';
import { fetchCollections, fetchItem, fetchItems, fetchPresets, fetchSession } from './api.ts';
import { catalogEntries } from './catalog.ts';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import { type CollectionOf, ItemList } from './components/ItemList.tsx';
import { CatalogOverview, ModuleIndex, ModulePanel } from './components/ModuleCatalog.tsx';
import { NewItemForm } from './components/NewItemForm.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { type Connection, useLive, useRemote, useRoute } from './hooks.ts';
import { Button, Icon } from './kit/index.ts';
import { MODULES } from './modules/registry.ts';
import type { Remote } from './remote.ts';
import { groupByTurn } from './sections.ts';
import { hashFor, ITEMS_HASH, modulesHash } from './selection.ts';
import type { CollectionView, Item, ItemView, PresetView } from './types.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message t-small' : 'pane-message action-error'}>{children}</p>;
}

function ListPane({
  items,
  selectedId,
  collectionOf,
}: {
  items: Remote<Item[]>;
  selectedId: string | undefined;
  collectionOf: CollectionOf;
}) {
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
    <ItemList
      sections={groupByTurn(items.value)}
      selectedId={selectedId}
      collectionOf={collectionOf}
    />
  );
}

type DetailPaneProps = {
  id: string;
  item: Remote<ItemView | null>;
  canWrite: boolean;
  collectionOf: CollectionOf;
};

function DetailPane({ id, item, canWrite, collectionOf }: DetailPaneProps) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading') return <Message>Loading…</Message>;
  if (!item.value) return <Message>Item {id} not found.</Message>;
  return (
    <ItemDetail
      item={item.value}
      canWrite={canWrite}
      collection={collectionOf(item.value.collection)}
    />
  );
}

type SelectedItemProps = {
  id: string;
  version: number;
  connection: Connection;
  canWrite: boolean;
  collectionOf: CollectionOf;
};

function SelectedItem({ id, version, connection, canWrite, collectionOf }: SelectedItemProps) {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  return (
    <DetailPane
      id={id}
      item={useRemote(load, version, connection)}
      canWrite={canWrite}
      collectionOf={collectionOf}
    />
  );
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
        <main className="layout">
          <div className="list-pane">
            <ListPane items={items} selectedId={selectedId} collectionOf={collectionOf} />
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
