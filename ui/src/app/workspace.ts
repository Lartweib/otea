import { useSyncExternalStore } from 'react';
import type { IntakeParent } from '../components/NewItemForm.tsx';

// How the workspace is laid out now (SPEC §6.4): the rail folded, the list narrowed beside an open
// item or the intake, Ampliar, what the view lists (the detail's widths read it), the intake, the
// activity drawer and the connect dialog. Only the fold is remembered (otea.sidebar).
export type Workspace = {
  folded: boolean;
  narrow: boolean;
  full: boolean;
  listKind: 'list' | 'table' | 'cards';
  intake: { board?: string; parent?: IntakeParent } | null;
  activity: boolean;
  connect: boolean;
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

export function useWorkspace(): Workspace {
  return useSyncExternalStore(workspace.subscribe, workspace.get, workspace.get);
}
