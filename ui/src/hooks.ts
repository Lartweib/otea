import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { activeLease } from './lease.ts';
import { afterFailure, type Remote } from './remote.ts';
import { type Route, routeFromHash } from './selection.ts';
import type { Lease } from './types.ts';

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

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
