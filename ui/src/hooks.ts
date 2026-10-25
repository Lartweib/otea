import { useEffect, useState, useSyncExternalStore } from 'react';
import { idFromHash } from './selection.ts';

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

export type Remote<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; message: string };

export function useRemote<T>(
  load: (signal: AbortSignal) => Promise<T>,
  version: number,
): Remote<T> {
  const [remote, setRemote] = useState<Remote<T>>({ status: 'loading' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version means the data changed
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (value) => setRemote({ status: 'ready', value }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setRemote({ status: 'failed', message: error instanceof Error ? error.message : 'Failed' });
      },
    );
    return () => controller.abort();
  }, [load, version]);
  return remote;
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useSelectedId(): string | undefined {
  return idFromHash(useSyncExternalStore(subscribeToHash, () => window.location.hash));
}
