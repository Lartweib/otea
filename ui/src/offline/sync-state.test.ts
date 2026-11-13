import { describe, expect, it } from 'vitest';
import { noteVersion, offlineCapable, VERSION_KEY } from './register.ts';
import { FROM_CACHE, SAVED_AT } from './sw-routes.ts';
import { afterRead, readOf, type SyncState } from './sync-state.ts';

const start: SyncState = { offline: false, syncedAt: null };

describe('afterRead', () => {
  it('a read from the PC: online, synced now', () => {
    expect(afterRead(start, { kind: 'fresh' }, 100)).toEqual({ offline: false, syncedAt: 100 });
  });

  it('a read from the cache: offline, synced when that answer came', () => {
    expect(afterRead(start, { kind: 'cached', savedAt: 40 }, 100)).toEqual({
      offline: true,
      syncedAt: 40,
    });
  });

  it('keeps the latest sync it knows of', () => {
    const synced = afterRead(start, { kind: 'fresh' }, 90);
    expect(afterRead(synced, { kind: 'cached', savedAt: 40 }, 100)).toEqual({
      offline: true,
      syncedAt: 90,
    });
    expect(afterRead(synced, { kind: 'failed' }, 100)).toEqual({ offline: true, syncedAt: 90 });
  });

  it('back online with the next read from the PC', () => {
    const off = afterRead(start, { kind: 'failed' }, 50);
    expect(afterRead(off, { kind: 'fresh' }, 60)).toEqual({ offline: false, syncedAt: 60 });
  });
});

describe('readOf', () => {
  it('reads the marks the service worker puts on a cached answer', () => {
    expect(readOf(new Headers())).toEqual({ kind: 'fresh' });
    expect(readOf(new Headers({ [FROM_CACHE]: '1', [SAVED_AT]: '1700' }))).toEqual({
      kind: 'cached',
      savedAt: 1700,
    });
    expect(readOf(new Headers({ [FROM_CACHE]: '1' }))).toEqual({ kind: 'cached', savedAt: null });
  });
});

describe('offlineCapable', () => {
  const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
  const DESKTOP_APP = 'Mozilla/5.0 (Windows NT 10.0) Chrome/138.0 Electron/37.2.0 Safari/537.36';

  it('works over HTTPS (Tailscale, localhost) with service workers', () => {
    expect(offlineCapable({ secure: true, hasWorker: true, userAgent: PHONE })).toBe(true);
  });

  it('not on the local network’s plain HTTP: the app works only while the PC is on', () => {
    expect(offlineCapable({ secure: false, hasWorker: true, userAgent: PHONE })).toBe(false);
    expect(offlineCapable({ secure: true, hasWorker: false, userAgent: PHONE })).toBe(false);
  });

  it('never inside the desktop app, which is the PC itself', () => {
    expect(offlineCapable({ secure: true, hasWorker: true, userAgent: DESKTOP_APP })).toBe(false);
  });
});

describe('noteVersion', () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    };
  };

  it('says "updated" once, on the first look at a new version', () => {
    const store = memory();
    store.setItem(VERSION_KEY, 'aaa');

    expect(noteVersion(store, 'bbb')).toBe(true);
    expect(noteVersion(store, 'bbb')).toBe(false);
    expect(store.map.get(VERSION_KEY)).toBe('bbb');
  });

  it('says nothing on the first version this browser runs, or without storage', () => {
    const store = memory();

    expect(noteVersion(store, 'aaa')).toBe(false);
    expect(store.map.get(VERSION_KEY)).toBe('aaa');
    expect(noteVersion(undefined, 'aaa')).toBe(false);
  });
});
