import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspace } from './workspace.ts';

let stored: Record<string, string>;

beforeEach(() => {
  stored = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored[k] ?? null,
    setItem: (k: string, v: string) => {
      stored[k] = v;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('the workspace', () => {
  it('starts open, listing, with nothing beside the list', () => {
    expect(makeWorkspace().get()).toEqual({
      folded: false,
      narrow: false,
      full: false,
      listKind: 'list',
      intake: null,
      activity: false,
      connect: false,
    });
  });

  it('remembers the folded rail in this browser', () => {
    stored['otea.sidebar'] = 'folded';
    const ws = makeWorkspace();
    expect(ws.get().folded).toBe(true);
    ws.set({ folded: false });
    expect(stored['otea.sidebar']).toBe('open');
  });

  it('tells who listens when it changes, and only then', () => {
    const ws = makeWorkspace();
    const seen: boolean[] = [];
    const off = ws.subscribe(() => seen.push(ws.get().narrow));
    ws.set({ narrow: true });
    ws.set({ narrow: true });
    off();
    ws.set({ narrow: false });
    expect(seen).toEqual([true]);
  });
});
