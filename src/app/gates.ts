import { type GateAction, gateAt, isClosed, positionOf } from '../core/board/engine.ts';
import { type BoardDefinition, guardedBranch, TITLE } from '../core/board/model.ts';
import { gateText } from '../core/board/next.ts';
import { partByName } from '../core/board/reading.ts';
import { selectItems } from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Item, listItems, workflowOf } from './items.ts';
import { itemOnBoard, type LiveBoard, liveBoards } from './next.ts';

// How one item stands on a gated action: whether its state allows it, and which states do; on a
// board, `text` says it in the board's words (gateText).
export type GateVerdict = {
  id: string;
  state: string;
  allowed: boolean;
  allowedIn: string[];
  text?: string;
};

// `items` holds a verdict for every item checked; empty, nothing gated the action (`note` says
// why), which allows it. The action is allowed only when every item checked allows it.
export type GateCheck = { gate: string; allowed: boolean; items: GateVerdict[]; note?: string };

const GATED: readonly string[] = ['push', 'merge'];

// The keys a check names, as one board stores them: `branch` is its protected branch, `repo` the
// field its guard reads the repository from (a board without one leaves the repo out: the branch
// alone names the item), any other key a part by its name. Undefined when the board cannot hold
// such an item.
function boardKeys(
  def: BoardDefinition,
  fields: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  const branch = guardedBranch(def);
  if (!branch) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'branch') out[branch.id] = value;
    else if (key === 'repo') {
      if (branch.guard.repo !== undefined) out[branch.guard.repo] = value;
    } else if (key === TITLE) out[TITLE] = value;
    else {
      const part = partByName(def, key);
      if (!part) return undefined;
      out[part.id] = value;
    }
  }
  return out;
}

function holds(
  item: { title: string; fields: Record<string, unknown> },
  keys: Record<string, string>,
) {
  return Object.entries(keys).every(
    ([key, value]) => (key === TITLE ? item.title : item.fields[key]) === value,
  );
}

function boardVerdicts(
  ctx: Context,
  board: LiveBoard,
  gate: GateAction,
  fields: Readonly<Record<string, string>>,
): { verdict: GateVerdict; open: boolean }[] {
  const keys = boardKeys(board.def, fields);
  if (!keys) return [];
  return selectItems(ctx.db, { collection: board.collection })
    .filter((item) => holds(item, keys))
    .map((item) => {
      const position = positionOf(item.state);
      const round = itemOnBoard(ctx, item, board.def).round;
      const verdict: GateVerdict = {
        id: item.id,
        state: item.state,
        allowed: gateAt(board.def, position, gate).allowed,
        allowedIn: workflowOf(ctx, item).gates?.[gate] ?? [],
        text: gateText(board.def, item.id, position, gate, round),
      };
      return { verdict, open: !isClosed(position) };
    });
}

// Checks the items whose fields hold every value given and whose workflow gates the action: on a
// board, its protected branch (and the repo its guard reads), matched by their hidden ids and
// answered by the step engine; on a collection still on a preset, its workflow's gates. The open
// ones are checked when there are any; otherwise the closed ones, since a closed state can allow an
// action too (merging what was approved).
export function checkGate(ctx: Context, gate: string, fields: Record<string, string>): GateCheck {
  const boards = liveBoards(ctx);
  const onBoards = new Set(boards.map(({ collection }) => collection));
  const fromBoards = GATED.includes(gate)
    ? boards.flatMap((board) => boardVerdicts(ctx, board, gate as GateAction, fields))
    : [];
  const fromPresets = presetVerdicts(ctx, gate, fields, onBoards);
  const gated = [...fromBoards, ...fromPresets];
  const open = gated.filter((entry) => entry.open);
  const items = (open.length > 0 ? open : gated).map(({ verdict }) => verdict);
  const check: GateCheck = { gate, allowed: items.every(({ allowed }) => allowed), items };
  if (items.length === 0) check.note = `no item with a ${gate} gate matches`;
  return check;
}

function presetVerdicts(
  ctx: Context,
  gate: string,
  fields: Record<string, string>,
  onBoards: ReadonlySet<string>,
): { verdict: GateVerdict; open: boolean }[] {
  let items: Item[];
  try {
    items = listItems(ctx, { fields }).filter(({ collection }) => !onBoards.has(collection));
  } catch {
    return [];
  }
  return items.flatMap((item) => {
    const allowedIn = workflowOf(ctx, item).gates?.[gate];
    if (!allowedIn) return [];
    const verdict = {
      id: item.id,
      state: item.state,
      allowed: allowedIn.includes(item.state),
      allowedIn,
    };
    return [{ verdict, open: item.turn !== 'none' }];
  });
}

// The repository a board item's protected branch is in (its guard's repo field), or the `repo`
// field of an item still on a preset.
export function repoOfItem(ctx: Context, item: Item, boards = liveBoards(ctx)): unknown {
  const board = boards.find(({ collection }) => collection === item.collection);
  if (!board) return item.fields.repo;
  const repo = guardedBranch(board.def)?.guard.repo;
  return repo === undefined ? undefined : item.fields[repo];
}
