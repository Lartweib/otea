import { type ReactNode, useCallback } from 'react';
import { fetchItem, fetchItems, fetchSession } from './api.ts';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import { ItemList } from './components/ItemList.tsx';
import { type Connection, useLive, useRemote, useSelectedId } from './hooks.ts';
import type { Remote } from './remote.ts';
import { groupByTurn } from './sections.ts';
import type { Item, ItemView } from './types.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message muted' : 'pane-message'}>{children}</p>;
}

function ListPane({
  items,
  selectedId,
}: {
  items: Remote<Item[]>;
  selectedId: string | undefined;
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
  return <ItemList sections={groupByTurn(items.value)} selectedId={selectedId} />;
}

type DetailPaneProps = { id: string; item: Remote<ItemView | null>; canWrite: boolean };

function DetailPane({ id, item, canWrite }: DetailPaneProps) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading') return <Message>Loading…</Message>;
  if (!item.value) return <Message>Item {id} not found.</Message>;
  return <ItemDetail item={item.value} canWrite={canWrite} />;
}

type SelectedItemProps = {
  id: string;
  version: number;
  connection: Connection;
  canWrite: boolean;
};

function SelectedItem({ id, version, connection, canWrite }: SelectedItemProps) {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  return <DetailPane id={id} item={useRemote(load, version, connection)} canWrite={canWrite} />;
}

export function App() {
  const { connection, version } = useLive();
  const selectedId = useSelectedId();
  const items = useRemote(fetchItems, version, connection);
  const session = useRemote(fetchSession, 0, connection);
  const canWrite = session.status === 'ready' && session.value.canWrite;
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Otea</span>
        <ConnectionBadge connection={connection} />
      </header>
      <main className="layout">
        <div className="list-pane">
          <ListPane items={items} selectedId={selectedId} />
        </div>
        <div className="detail-pane">
          {selectedId ? (
            <SelectedItem
              key={selectedId}
              id={selectedId}
              version={version}
              connection={connection}
              canWrite={canWrite}
            />
          ) : (
            <Message>Select an item to see its details.</Message>
          )}
        </div>
      </main>
    </div>
  );
}
