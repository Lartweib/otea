import { type BoardDefinition, SAME } from './model.ts';

// How boards join: "se divide en" is the only declared join. A board's items divide into the
// items of the board its split names (or into items of its own, SAME); when the split says
// `always`, those items never stand alone. Every other link (blocks, relates…) is free between
// any boards. The CLI, MCP, the API and Studio's home ask these.

export type BoardOf = { id: string; def: BoardDefinition };

export type Join = { parent: BoardOf; child: BoardOf; always: boolean };

// Every split between two boards, and every board that divides into its own items.
export function joinsOf(boards: readonly BoardOf[]): Join[] {
  return boards.flatMap((parent) => {
    const split = parent.def.split;
    if (!split) return [];
    const child = split.board === SAME ? parent : boards.find((board) => board.id === split.board);
    return child ? [{ parent, child, always: split.always }] : [];
  });
}

// The join whose parts are on `childId` (another board's, never its own), when there is one.
export function parentJoinOf(boards: readonly BoardOf[], childId: string): Join | undefined {
  return joinsOf(boards).find(({ parent, child }) => child.id === childId && parent.id !== childId);
}

// Whether an item on `parent` may take an item on `child` as one of its parts: `ok`; `parent_type`
// when the parent board divides into another board; `across_boards` when the parent board divides
// into nothing and the child is on another board (plain parents stay within a board).
export function partRule(parent: BoardOf, child: BoardOf): 'ok' | 'parent_type' | 'across_boards' {
  const split = parent.def.split;
  if (!split) return parent.id === child.id ? 'ok' : 'across_boards';
  const target = split.board === SAME ? parent.id : split.board;
  return target === child.id ? 'ok' : 'parent_type';
}

// Whether a new item on `childId` needs a parent: the board that always divides into it.
export function requiredParent(boards: readonly BoardOf[], childId: string): BoardOf | undefined {
  const join = parentJoinOf(boards, childId);
  return join?.always ? join.parent : undefined;
}
