import { useSyncExternalStore } from 'react';
import type { IntakeParent } from '../components/NewItemForm.tsx';
import { hashOf, type Route } from '../selection.ts';

// How the workspace is laid out now (SPEC §6.4): the rail folded, the list narrowed beside an open
// item or the intake, Ampliar, what the view lists (the detail's widths read it), the intake, the
// activity drawer, the connect dialog and the agent whose sheet is open beside the list. Only the
// fold is remembered (otea.sidebar).
export type Workspace = {
  folded: boolean;
  narrow: boolean;
  full: boolean;
  listKind: 'list' | 'table' | 'cards';
  intake: { board?: string; parent?: IntakeParent } | null;
  activity: boolean;
  connect: boolean;
  agent: string | null;
};

export type WorkspaceStore = {
  get(): Workspace;
  set(p: Partial<Workspace>): void;
  subscribe(fn: () => void): () => void;
};

const SIDEBAR = 'otea.sidebar';

function readFolded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR) === 'folded';
  } catch {
    return false;
  }
}

export function makeWorkspace(): WorkspaceStore {
  let state: Workspace = {
    folded: readFolded(),
    narrow: false,
    full: false,
    listKind: 'list',
    intake: null,
    activity: false,
    connect: false,
    agent: null,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(p) {
      const keys = Object.keys(p) as (keyof Workspace)[];
      if (keys.every((k) => Object.is(state[k], p[k]))) return;
      state = { ...state, ...p };
      if ('folded' in p) {
        try {
          localStorage.setItem(SIDEBAR, state.folded ? 'folded' : 'open');
        } catch {
          // kept for this page only
        }
      }
      for (const fn of [...listeners]) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const workspace: WorkspaceStore = makeWorkspace();

// The new item page belongs to the place it was opened on, as the phone's capture sheet does: the
// route moving anywhere else (a link, the back button, a typed hash) puts it away. Left open, on the
// phone it kept the screen, and the bottom bar hidden, after you had gone.
// An agent's sheet stays while the item beside it closes (it opened over the list), and goes when
// an item opens or the view changes.
export function followRoute(store: WorkspaceStore, from: Route, to: Route): void {
  if (hashOf(from) !== hashOf(to)) store.set({ intake: null });
  const { item: _from, ...fromView } = from;
  const { item: _to, ...toView } = to;
  if (to.item || hashOf(fromView as Route) !== hashOf(toView as Route)) store.set({ agent: null });
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(workspace.subscribe, workspace.get, workspace.get);
}
