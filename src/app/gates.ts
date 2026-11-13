import { type GateAction, gateAt, isClosed, positionOf } from '../core/board/engine.ts';
import { type BoardDefinition, guardedBranch, TITLE } from '../core/board/model.ts';
import { gateText } from '../core/board/next.ts';
import { partByName } from '../core/board/reading.ts';
import { OteaError } from '../core/errors.ts';
import { listCollections, selectItems } from '../store/queries.ts';
import { presetOf } from './collections.ts';
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

// Repo names match whatever their case: git hosts and the default file systems of Windows and macOS
// take `API` and `api` as one repo, so a check must not let one of them pass where the other stops.
export function sameRepo(stored: unknown, named: string): boolean {
  return typeof stored === 'string' && stored.toLowerCase() === named.toLowerCase();
}

// Whether the item holds every key; `repo`, the key its repo name is in, matches by sameRepo.
function holds(
  item: { title: string; fields: Record<string, unknown> },
  keys: Record<string, string>,
  repo?: string,
) {
  return Object.entries(keys).every(([key, value]) => {
    const stored = key === TITLE ? item.title : item.fields[key];
    return key === repo ? sameRepo(stored, value) : stored === value;
  });
}

function boardVerdicts(
  ctx: Context,
  board: LiveBoard,
  gate: GateAction,
  fields: Readonly<Record<string, string>>,
): { verdict: GateVerdict; open: boolean }[] {
  const keys = boardKeys(board.def, fields);
  if (!keys) return [];
  const repo = guardedBranch(board.def)?.guard.repo;
  return selectItems(ctx.db, { collection: board.collection })
    .filter((item) => holds(item, keys, repo))
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
  assertKnownGate(ctx, gate, onBoards);
  assertKnownKeys(ctx, boards, onBoards, fields);
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

// A gate no board and no preset declares is a typo (`psuh`) or an action Otea does not gate
// (`deploy`): the check refuses it rather than matching nothing and allowing the action.
function assertKnownGate(ctx: Context, gate: string, onBoards: ReadonlySet<string>): void {
  const declared = listCollections(ctx.db)
    .filter(({ name }) => !onBoards.has(name))
    .flatMap((collection) =>
      presetOf(ctx, collection).types.flatMap(({ workflow }) => Object.keys(workflow.gates ?? {})),
    );
  const gates = [...new Set([...GATED, ...declared])].sort();
  if (gates.includes(gate)) return;
  throw new OteaError('invalid_gate', `Unknown gate "${gate}"; the gates are ${gates.join(', ')}`);
}

// A key no board part and no preset field names is a typo: the check refuses it rather than
// matching nothing and allowing the action.
function assertKnownKeys(
  ctx: Context,
  boards: readonly LiveBoard[],
  onBoards: ReadonlySet<string>,
  fields: Readonly<Record<string, string>>,
): void {
  const presets = listCollections(ctx.db)
    .filter(({ name }) => !onBoards.has(name))
    .map((collection) => presetOf(ctx, collection));
  for (const key of Object.keys(fields)) {
    if (key === 'branch' || key === 'repo' || key === TITLE) continue;
    const named =
      boards.some(({ def }) => partByName(def, key) !== undefined) ||
      presets.some((preset) => key in preset.fields);
    if (!named) {
      throw new OteaError('invalid_fields', `No board has a field named "${key}" to check`);
    }
  }
}

function presetVerdicts(
  ctx: Context,
  gate: string,
  fields: Record<string, string>,
  onBoards: ReadonlySet<string>,
): { verdict: GateVerdict; open: boolean }[] {
  // An error here fails the check closed: an item Otea cannot read is never allowed by silence.
  const { repo, ...exact } = fields;
  const items: Item[] = listItems(ctx, { fields: exact }).filter(
    (item) =>
      !onBoards.has(item.collection) && (repo === undefined || sameRepo(item.fields.repo, repo)),
  );
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
