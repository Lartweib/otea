import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { type Attention, attentionOf, nextLeaseExpiry } from './attention.ts';
import { activeLease, type TimeCell, timeCell } from './lease.ts';
import { afterFailure, type Remote } from './remote.ts';
import { hideTier } from './row-grid.ts';
import { type Route, routeFromHash } from './selection.ts';
import type { Item, Lease } from './types.ts';

export type Connection = 'connecting' | 'live' | 'reconnecting';

export type Live = { connection: Connection; version: number };

export function useLive(url = '/api/stream'): Live {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const source = new EventSource(url);
    const refresh = () => setVersion((current) => current + 1);
    source.addEventListener('ready', () => {
      setConnection('live');
      refresh();
    });
    source.addEventListener('change', refresh);
    source.addEventListener('error', () => setConnection('reconnecting'));
    return () => source.close();
  }, [url]);
  return { connection, version };
}

export function useRemote<T>(
  load: (signal: AbortSignal) => Promise<T>,
  version: number,
  connection: Connection,
): Remote<T> {
  const [remote, setRemote] = useState<Remote<T>>({ status: 'loading' });
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version means the data changed
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (value) => setRemote({ status: 'ready', value }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setRemote((previous) => afterFailure(previous, error, connectionRef.current));
      },
    );
    return () => controller.abort();
  }, [load, version]);
  return remote;
}

// Expiry writes nothing, so no change event arrives: re-render when the lease runs out.
export function useActiveLease(lease: Lease | null): Lease | null {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const expiresAt = lease?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(tick, remaining + 10);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return activeLease(lease, Date.now());
}

// The time column of a row, kept current: a lease's time left re-renders when its text changes
// (the next minute, hour or day left, then `expired`); the age changes with the item, as before.
export function useTimeCell(item: Pick<Item, 'updatedAt' | 'lease' | 'expiredLease'>): TimeCell {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const cell = timeCell(item, Date.now());
  const changesAt = cell.tone === 'left' ? cell.changesAt : undefined;
  useEffect(() => {
    if (changesAt === undefined) return;
    const timer = setTimeout(tick, Math.max(0, changesAt - Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [changesAt]);
  return cell;
}

// The workspace's attention, kept live: the items follow the stream, and since a lease running out
// writes nothing, it reads itself again when the first active lease expires.
export function useAttention(items: readonly Item[]): Attention {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const now = Date.now();
  const expiry = nextLeaseExpiry(items, now);
  useEffect(() => {
    if (expiry === undefined) return;
    const timer = setTimeout(tick, Math.max(0, expiry - Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [expiry]);
  return attentionOf(items, now);
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return routeFromHash(useSyncExternalStore(subscribeToHash, () => window.location.hash));
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

// Below 48rem the workspace is one column, and an item unfolds where it sits in the list.
export function usePhone(): boolean {
  return !useMediaQuery('(min-width: 48rem)');
}

// Marks an element (the list pane) with the hide tier its width puts it in (data-tier, see
// hideTier), as it resizes: dragging the divider, the window, a smaller screen. A callback ref.
export function useHideTier(): (element: HTMLElement | null) => (() => void) | undefined {
  return useCallback((element: HTMLElement | null) => {
    if (!element) return undefined;
    const mark = (width: number) => {
      const tier = String(hideTier(width));
      if (element.dataset.tier !== tier) element.dataset.tier = tier;
    };
    mark(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      mark(entry?.borderBoxSize?.[0]?.inlineSize ?? element.getBoundingClientRect().width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
