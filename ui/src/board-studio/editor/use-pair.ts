import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Selection } from '../../../../src/core/board/model.ts';
import type { Problem } from '../../../../src/core/board/problems.ts';
import type { PairIds, PairRole, PairWorkspace } from '../pair.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import {
  needsSetup,
  type SetupRow,
  type SetupStore,
  setupItems,
  setupRows,
  startSetup,
  tick,
} from './setup.ts';
import { type History, observe, startHistory } from './workspace.ts';

// The workspace of a joined pair (WORKSPACE.md): both drafts, the board on screen, one undo and
// redo history across the two (an undo of a change on the other board switches to it), and the
// «Qué falta configurar» checklist of a pair a template set made, kept per pair in this browser.

export type PairState = {
  workspace: PairWorkspace;
  role: PairRole;
  drafts: Readonly<Record<PairRole, ReadyDraft>>;
  // The board on screen, its Deshacer and Rehacer those of the workspace.
  active: ReadyDraft;
  switchTo: (role: PairRole, sel?: Selection) => void;
  setup: {
    rows: SetupRow[];
    errors: { role: PairRole; problem: Problem }[];
    ok: (k: string) => void;
    hidden: boolean;
    hide: () => void;
  } | null;
};

type Stored = SetupStore & { hidden?: boolean };

const storeKey = (ids: PairIds) => `otea.studio.setup.${ids.parent}.${ids.child}`;

function readStore(ids: PairIds): Stored | null {
  try {
    const raw = window.localStorage.getItem(storeKey(ids));
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    return value && typeof value === 'object' && value.v0 && Array.isArray(value.ok) ? value : null;
  } catch {
    return null;
  }
}

function writeStore(ids: PairIds, value: Stored): void {
  try {
    window.localStorage.setItem(storeKey(ids), JSON.stringify(value));
  } catch {
    // The checklist still works in this tab; it just will not be remembered.
  }
}

export function usePair(
  ids: PairIds,
  parent: ReadyDraft,
  child: ReadyDraft,
  first: PairRole,
): PairState {
  const [role, setRole] = useState<PairRole>(first);
  const [history, setHistory] = useState<History>(() => startHistory(parent.depth, child.depth));
  const pu = parent.depth.undo;
  const pr = parent.depth.redo;
  const cu = child.depth.undo;
  const cr = child.depth.redo;
  useEffect(() => {
    setHistory((h) =>
      observe(observe(h, 'parent', { undo: pu, redo: pr }), 'child', { undo: cu, redo: cr }),
    );
  }, [pu, pr, cu, cr]);

  const drafts = useMemo(() => ({ parent, child }), [parent, child]);
  const switchTo = useCallback(
    (to: PairRole, sel?: Selection) => {
      setRole(to);
      if (sel) drafts[to].select(sel);
    },
    [drafts],
  );
  const undo = () => {
    const last = history.undo.at(-1);
    if (!last) return;
    if (last !== role) setRole(last);
    drafts[last].endBurst();
    drafts[last].undo();
  };
  const redo = () => {
    const next = history.redo.at(-1);
    if (!next) return;
    if (next !== role) setRole(next);
    drafts[next].redo();
  };
  const own = drafts[role];
  const active: ReadyDraft = {
    ...own,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    undo,
    redo,
  };

  // «Qué falta configurar»: only for a pair a template set made, until the parent is published.
  const defs = { parent: parent.def, child: child.def };
  const shown = needsSetup(defs, { parentLive: parent.record.live !== null });
  const [store, setStore] = useState<Stored | null>(() => readStore(ids));
  // The items are what the template made: those the checklist started with.
  const all = shown ? setupItems(defs) : [];
  const items = store ? all.filter((item) => item.k in store.v0) : all;
  useEffect(() => {
    if (!shown || store) return;
    const fresh = startSetup(items, defs);
    writeStore(ids, fresh);
    setStore(fresh);
  });
  const update = (next: Stored) => {
    writeStore(ids, next);
    setStore(next);
  };
  const setup =
    shown && store
      ? {
          rows: setupRows(items, defs, store),
          errors: (['parent', 'child'] as const).flatMap((r) =>
            drafts[r].problems
              .filter((p) => p.level === 'error')
              .map((problem) => ({ role: r, problem })),
          ),
          ok: (k: string) =>
            update({ ...tick(store, k), ...(store.hidden ? { hidden: true } : {}) }),
          hidden: store.hidden === true,
          hide: () => update({ ...store, hidden: true }),
        }
      : null;

  const workspace: PairWorkspace = { ids, parent, child, active: role, setActive: setRole };
  return { workspace, role, drafts, active, switchTo, setup };
}
