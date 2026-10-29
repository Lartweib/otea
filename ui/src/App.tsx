import { type ReactNode, useCallback, useState } from 'react';
import { fetchCollections, fetchItem, fetchItems, fetchSession } from './api.ts';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import { ItemList } from './components/ItemList.tsx';
import { NewItemForm } from './components/NewItemForm.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { type Connection, useLive, useRemote, useSelectedId } from './hooks.ts';
import { Button, Icon } from './kit/index.ts';
import type { Remote } from './remote.ts';
import { groupByTurn } from './sections.ts';
import { hashFor } from './selection.ts';
import type { CollectionView, Item, ItemView } from './types.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message t-small' : 'pane-message action-error'}>{children}</p>;
}

type IncompleteOf = (collection: string) => string | undefined;

function ListPane({
  items,
  selectedId,
  incompleteOf,
}: {
  items: Remote<Item[]>;
  selectedId: string | undefined;
  incompleteOf: IncompleteOf;
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
      incompleteOf={incompleteOf}
    />
  );
}

type DetailPaneProps = {
  id: string;
  item: Remote<ItemView | null>;
  canWrite: boolean;
  incompleteOf: IncompleteOf;
};

function DetailPane({ id, item, canWrite, incompleteOf }: DetailPaneProps) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading') return <Message>Loading…</Message>;
  if (!item.value) return <Message>Item {id} not found.</Message>;
  return (
    <ItemDetail
      item={item.value}
      canWrite={canWrite}
      incompleteState={incompleteOf(item.value.collection)}
    />
  );
}

type SelectedItemProps = {
  id: string;
  version: number;
  connection: Connection;
  canWrite: boolean;
  incompleteOf: IncompleteOf;
};

function SelectedItem({ id, version, connection, canWrite, incompleteOf }: SelectedItemProps) {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  return (
    <DetailPane
      id={id}
      item={useRemote(load, version, connection)}
      canWrite={canWrite}
      incompleteOf={incompleteOf}
    />
  );
}

// Which state of a collection means "incomplete" comes from its preset.
function incompleteLookup(collections: Remote<CollectionView[]>): IncompleteOf {
  const list = collections.status === 'ready' ? collections.value : [];
  return (name) => list.find((collection) => collection.name === name)?.incomplete;
}

function Brand() {
  return (
    <span className="brand">
      <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
        <path
          className="brand-fork"
          d="M5 0 V8 C5 14 11 12 11 18 V26 M17 0 V8 C17 14 11 12 11 18"
        />
        <circle className="brand-dot" cx="17" cy="4.5" r="3.5" />
      </svg>
      otea
    </span>
  );
}

type Intake = { openedOn: string | undefined };

export function App() {
  const { connection, version } = useLive();
  const selectedId = useSelectedId();
  const items = useRemote(fetchItems, version, connection);
  const session = useRemote(fetchSession, 0, connection);
  const collections = useRemote(fetchCollections, 0, connection);
  const incompleteOf = incompleteLookup(collections);
  const canWrite = session.status === 'ready' && session.value.canWrite;
  const [intake, setIntake] = useState<Intake>();
  const creating = canWrite && intake !== undefined && intake.openedOn === selectedId;
  const closeIntake = () => setIntake(undefined);
  const showCreated = (id: string) => {
    closeIntake();
    window.location.hash = hashFor(id);
  };
  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <ConnectionBadge connection={connection} />
          <ThemeToggle />
          {canWrite ? (
            <Button
              size="sm"
              aria-pressed={creating}
              onClick={() => setIntake({ openedOn: selectedId })}
            >
              <Icon name="plus" />
              New item
            </Button>
          ) : null}
        </div>
      </header>
      <main className="layout">
        <div className="list-pane">
          <ListPane items={items} selectedId={selectedId} incompleteOf={incompleteOf} />
        </div>
        <div className="detail-pane">
          <div className="detail-panel raised">
            {creating ? (
              <NewItemForm connection={connection} onCancel={closeIntake} onCreated={showCreated} />
            ) : selectedId ? (
              <SelectedItem
                key={selectedId}
                id={selectedId}
                version={version}
                connection={connection}
                canWrite={canWrite}
                incompleteOf={incompleteOf}
              />
            ) : (
              <Message>Select an item to see its details.</Message>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
