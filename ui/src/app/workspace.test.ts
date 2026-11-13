import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followRoute, makeWorkspace } from './workspace.ts';

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
      agent: null,
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

describe('the new item page follows the place (mobile analysis 2.3 #6)', () => {
  it('goes when the route moves anywhere else, by the hash or the back button', () => {
    const ws = makeWorkspace();
    ws.set({ intake: { board: 'Tareas' } });
    followRoute(ws, { view: 'board', board: 'Tareas' }, { view: 'board', board: 'Tareas' });
    expect(ws.get().intake).toEqual({ board: 'Tareas' });
    followRoute(ws, { view: 'board', board: 'Tareas' }, { view: 'board', board: 'Errores' });
    expect(ws.get().intake).toBeNull();
    ws.set({ intake: {} });
    followRoute(ws, { view: 'toca' }, { view: 'toca', item: 'TAR-1' });
    expect(ws.get().intake).toBeNull();
  });

  it('keeps an agent’s sheet while an item closes, and puts it away when anything else opens', () => {
    const ws = makeWorkspace();
    ws.set({ agent: 'claude-a' });
    followRoute(ws, { view: 'toca', item: 'TAR-1' }, { view: 'toca' });
    expect(ws.get().agent).toBe('claude-a');
    followRoute(ws, { view: 'toca' }, { view: 'toca', item: 'TAR-2' });
    expect(ws.get().agent).toBeNull();
    ws.set({ agent: 'claude-a' });
    followRoute(ws, { view: 'toca' }, { view: 'atasco' });
    expect(ws.get().agent).toBeNull();
  });

  it('leaves the rest of the workspace as it was', () => {
    const ws = makeWorkspace();
    ws.set({ intake: {}, narrow: true, activity: true });
    followRoute(ws, { view: 'toca' }, { view: 'triage' });
    expect(ws.get()).toMatchObject({ intake: null, narrow: true, activity: true });
  });
});
