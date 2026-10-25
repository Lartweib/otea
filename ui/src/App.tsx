import { type ReactNode, useCallback } from 'react';
import { fetchItem, fetchItems } from './api.ts';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import { ItemList } from './components/ItemList.tsx';
import { type Remote, useLive, useRemote, useSelectedId } from './hooks.ts';
import { groupByTurn } from './sections.ts';
import type { Item, ItemWithEvents } from './types.ts';

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

function DetailPane({ id, item }: { id: string; item: Remote<ItemWithEvents | null> }) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading' || (item.value && item.value.id !== id)) {
    return <Message>Loading…</Message>;
  }
  if (!item.value) return <Message>Item {id} not found.</Message>;
  return <ItemDetail item={item.value} />;
}

function SelectedItem({ id, version }: { id: string; version: number }) {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  return <DetailPane id={id} item={useRemote(load, version)} />;
}

export function App() {
  const { connection, version } = useLive();
  const selectedId = useSelectedId();
  const items = useRemote(fetchItems, version);
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
            <SelectedItem id={selectedId} version={version} />
          ) : (
            <Message>Select an item to see its details.</Message>
          )}
        </div>
      </main>
    </div>
  );
}
