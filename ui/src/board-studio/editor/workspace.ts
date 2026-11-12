import type { PairRole } from '../pair.ts';

// One undo and redo history across the two boards of a joined pair. Each board keeps its own
// history (draft.ts); this keeps which board each step belongs to, in the order they were made, so
// Deshacer undoes the last change whichever board it was on (and switches to that board). It learns
// what happened from how deep each board's own history is: an edit makes it deeper, an undo moves
// one step to redo, a redo moves it back, and a board read again (after publishing) starts empty.

export type Depth = { undo: number; redo: number };

export type History = {
  undo: readonly PairRole[];
  redo: readonly PairRole[];
  seen: Readonly<Record<PairRole, Depth>>;
};

export function startHistory(parent: Depth, child: Depth): History {
  return {
    undo: [...Array(parent.undo).fill('parent'), ...Array(child.undo).fill('child')],
    redo: [...Array(parent.redo).fill('parent'), ...Array(child.redo).fill('child')],
    seen: { parent, child },
  };
}

// Moves the last `n` steps of `role` from one list to the other.
function move(from: PairRole[], to: PairRole[], role: PairRole, n: number): void {
  for (let k = 0; k < n; k++) {
    const at = from.lastIndexOf(role);
    if (at < 0) return;
    from.splice(at, 1);
    to.push(role);
  }
}

export function observe(history: History, role: PairRole, now: Depth): History {
  const was = history.seen[role];
  const du = now.undo - was.undo;
  const dr = now.redo - was.redo;
  if (du === 0 && dr === 0) return history;
  const undo = [...history.undo];
  let redo = [...history.redo];
  if (du > 0 && dr < 0) move(redo, undo, role, du);
  else if (du > 0) {
    for (let k = 0; k < du; k++) undo.push(role);
    redo = [];
  } else if (du < 0 && dr > 0) move(undo, redo, role, -du);
  else if (du < 0) {
    // Read again: none of its steps can be undone or redone any more.
    return {
      undo: undo.filter((r) => r !== role),
      redo: redo.filter((r) => r !== role),
      seen: { ...history.seen, [role]: now },
    };
  } else if (dr < 0) redo = redo.filter((r) => r !== role);
  return { undo, redo, seen: { ...history.seen, [role]: now } };
}
