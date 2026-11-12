import { type BoardDefinition, SAME } from '../../../../src/core/board/model.ts';
import type { BoardSummary } from '../api.ts';

// How a board joins others, as the editor's sentences say it: what each item divides into (a
// split), and the board that divides into this one. Read from the project's boards as the home
// lists them, with the drafts on screen in place of what the list had.

export type SplitInfo = {
  same: boolean;
  id: string;
  name: string;
  item: string;
  always: boolean;
  published: boolean;
};

export function splitInfo(
  def: BoardDefinition,
  boards: readonly BoardSummary[],
  self: string,
): SplitInfo | null {
  const split = def.split;
  if (!split) return null;
  if (split.board === SAME || split.board === self)
    return { same: true, id: self, name: def.name, item: def.item, always: false, published: true };
  const other = boards.find((b) => b.id === split.board);
  if (!other) return null;
  return {
    same: false,
    id: other.id,
    name: other.definition.name,
    item: other.definition.item,
    always: split.always,
    published: other.liveVersion !== null,
  };
}

export type ParentInfo = { id: string; name: string; item: string; always: boolean };

export function parentInfo(boards: readonly BoardSummary[], self: string): ParentInfo | null {
  const parent = boards.find((b) => b.id !== self && b.definition.split?.board === self);
  if (!parent) return null;
  const { name, item, split } = parent.definition;
  return { id: parent.id, name, item, always: split?.always ?? false };
}

// The list with these definitions in place of what it had.
export function withDrafts(
  boards: readonly BoardSummary[],
  drafts: readonly { id: string; def: BoardDefinition; live: boolean }[],
): BoardSummary[] {
  const known = new Set(boards.map((b) => b.id));
  const out = boards.map((b) => {
    const draft = drafts.find((d) => d.id === b.id);
    return draft ? { ...b, name: draft.def.name, item: draft.def.item, definition: draft.def } : b;
  });
  for (const d of drafts)
    if (!known.has(d.id))
      out.push({
        id: d.id,
        name: d.def.name,
        item: d.def.item,
        icon: d.def.icon,
        builtin: false,
        status: d.live ? 'changed' : 'draft',
        liveVersion: d.live ? 1 : null,
        collection: null,
        open: 0,
        requestItem: null,
        definition: d.def,
      });
  return out;
}
