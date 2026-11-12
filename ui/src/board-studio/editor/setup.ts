import {
  type BoardDefinition,
  guardedBranch,
  type Selection,
  stepById,
} from '../../../../src/core/board/model.ts';
import type { PairRole } from '../pair.ts';

// «Qué falta configurar»: what a template set cannot decide for you (who does each step, when the
// protected branch is pushed, which field names the repository), as a checklist over both boards of
// the pair. An item ticks itself when its setting changes from what the template gave, or when you
// say it is fine («Así está bien»). Pure: the editor keeps the store per pair (browser storage).

export type SetupWhat = 'doer' | 'push' | 'repo';

export type SetupItem = {
  k: string;
  role: PairRole;
  what: SetupWhat;
  // A step id (doer), the branch field (push) or the repository field (repo).
  ref: string;
  // Where it is set: the step, or the card that holds the field.
  sel: Selection;
  // The field row that says it (the branch, for its push and its repository); null for a step.
  row: string | null;
};

export type PairDefs = { parent: BoardDefinition; child: BoardDefinition };

// What each item read when the checklist started, and what you ticked.
export type SetupStore = { v0: Readonly<Record<string, string>>; ok: readonly string[] };

// The template sets whose boards get the checklist.
const SETS = new Set(['repos']);

export function needsSetup(defs: PairDefs, state: { parentLive: boolean }): boolean {
  const { parent, child } = defs;
  return (
    !state.parentLive &&
    parent.template !== undefined &&
    SETS.has(parent.template) &&
    child.template === parent.template
  );
}

// Where a part is set: the form, the step that hands it off, or any time.
export function placeOf(def: BoardDefinition, ref: string): Selection {
  if (def.form.some((f) => f.ref === ref)) return { kind: 'form' };
  const step = def.steps.find((s) => s.hand.some((h) => h.ref === ref));
  if (step) return { kind: 'step', id: step.id };
  return { kind: 'anytime' };
}

export function setupItems(defs: PairDefs): SetupItem[] {
  const out: SetupItem[] = [];
  for (const role of ['parent', 'child'] as const)
    for (const step of defs[role].steps)
      out.push({
        k: `doer:${role}:${step.id}`,
        role,
        what: 'doer',
        ref: step.id,
        sel: { kind: 'step', id: step.id },
        row: null,
      });
  const branch = guardedBranch(defs.child);
  if (branch) {
    const sel = placeOf(defs.child, branch.id);
    const row = branch.id;
    out.push({
      k: `push:child:${branch.id}`,
      role: 'child',
      what: 'push',
      ref: branch.id,
      sel,
      row,
    });
    const repo = branch.guard.repo;
    if (repo)
      out.push({
        k: `repo:child:${repo}`,
        role: 'child',
        what: 'repo',
        ref: repo,
        sel,
        row,
      });
  }
  return out;
}

// What an item reads now; null once its step or field is gone.
export function setupSig(def: BoardDefinition, item: SetupItem): string | null {
  if (item.what === 'doer') {
    const step = stepById(def, item.ref);
    return step ? JSON.stringify([step.doer, step.reviewer]) : null;
  }
  const branch = guardedBranch(def);
  if (item.what === 'push') return branch ? branch.guard.push.join(',') : null;
  const part = def.parts[item.ref];
  return part ? JSON.stringify([part.kind, part.hint, part.options, branch?.guard.repo]) : null;
}

export function startSetup(items: readonly SetupItem[], defs: PairDefs): SetupStore {
  const v0: Record<string, string> = {};
  for (const item of items) v0[item.k] = setupSig(defs[item.role], item) ?? '';
  return { v0, ok: [] };
}

export function tick(store: SetupStore, k: string): SetupStore {
  return {
    ...store,
    ok: store.ok.includes(k) ? store.ok.filter((x) => x !== k) : [...store.ok, k],
  };
}

export type SetupRow = SetupItem & { done: boolean };

export function setupRows(
  items: readonly SetupItem[],
  defs: PairDefs,
  store: SetupStore,
): SetupRow[] {
  return items.flatMap((item) => {
    const sig = setupSig(defs[item.role], item);
    if (sig === null) return [];
    const changed = store.v0[item.k] !== undefined && store.v0[item.k] !== sig;
    return [{ ...item, done: store.ok.includes(item.k) || changed }];
  });
}

// What is left unticked in «Qué falta configurar» while it shows: Publicar says it.
export function setupLeft(
  setup: { rows: readonly { done: boolean }[]; hidden: boolean } | null | undefined,
): number {
  if (!setup || setup.hidden) return 0;
  return setup.rows.filter((row) => !row.done).length;
}
