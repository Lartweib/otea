import {
  backWaysOf,
  type GateAction,
  gateAt,
  isClosed,
  landStepOf,
  type Position,
  positionOf,
  reopenStep,
  waysOf,
} from '../core/board/engine.ts';
import {
  type BoardDefinition,
  DROPPED,
  type Guard,
  guardedBranch,
  type Part,
  stepById,
  TITLE,
} from '../core/board/model.ts';
import {
  baseGateText,
  baseRefusal,
  branchForPersonText,
  commitsForPersonText,
  DONE_NAME,
  forPersonText,
  gateText,
  placeText,
  rewriteForPersonText,
  unnamedBranchRefusal,
} from '../core/board/next.ts';
import { partByName, stateName } from '../core/board/reading.ts';
import { OteaError } from '../core/errors.ts';
import { type ItemRecord, listCollections, selectEvents, selectItems } from '../store/queries.ts';
import { presetOf } from './collections.ts';
import type { Context } from './context.ts';
import { type Item, listItems, workflowOf } from './items.ts';
import { mergedOf } from './merged.ts';
import { itemOnBoard, type LiveBoard, liveBoards } from './next.ts';
import { approvedTipOf, handedOff, type Tip } from './tips.ts';

export type { Tip };

// How one item stands on a gated action: whether its state allows it, and which states do, each
// by id and by name; on a board, `text` says it in the board's words (gateText).
export type GateVerdict = {
  id: string;
  state: string;
  stateName: string;
  allowed: boolean;
  allowedIn: string[];
  allowedInNames: string[];
  text?: string;
};

// `items` holds a verdict for every item checked; empty, nothing gated the action (`note` says
// why), which allows it, unless a board protects the branch as its base and the action brings in
// none of its items (`refusal` says why). The action is allowed only when every item checked
// allows it.
export type GateCheck = {
  gate: string;
  allowed: boolean;
  items: GateVerdict[];
  note?: string;
  refusal?: string;
  // Under a refused push into a protected base: how the person lands a commit of their own.
  person?: string;
  // Under a refusal of commits no approved item holds or records: those commits.
  stray?: readonly BroughtCommit[];
};

// The branches a push or merge into a base branch brings in: asked of git only when a board
// protects that branch as its base. `unpushed` names those of them that hold commits their remote
// never got (`remote`): never reviewed, so they are refused whatever their item's state.
// `outside` names the commits the action brings in that none of the given branches holds, nor any
// of the `tips` (commits that hold the history under them, as a branch does), merge commits aside:
// they ride along unreviewed, so the action is refused, unless an approved item records them.
export type Brought = {
  branches: readonly string[];
  unpushed?: readonly { branch: string; remote: string }[];
  outside?: (held: readonly string[], tips?: readonly string[]) => readonly BroughtCommit[];
  // Whether the commit the action writes holds exactly what was approved of the branches it lands
  // (each at its approved tip, or as it stands when none was recorded), merged onto the base the
  // remote has: `onto` names that base for a push of the item's own branch, else it is what the
  // remote has of the branch pushed. A rebase with the same result passes; a conflict never does.
  landsAs?: (landing: readonly Landing[], onto?: string) => boolean;
  // What a merge of an approved branch takes, asked of its remote right now (P3C-R3-1): a forge
  // merges the branch as the remote has it, which a clone without Otea's hook can push to after
  // the approval. `base` is the branch it merges into.
  takes?: (tip: Tip, base?: string) => MergeTake;
  // Whether a push of a branch rewrites what the remote has of it instead of adding to it (a force
  // push): asked only of a push the pre-push hook names (--commits).
  rewrites?: () => boolean;
};

// How the branch a merge takes stands with the tip the person approved: `held` when it lands as
// approved (that commit, or a rebase onto the base with the same result); else the ref it was read
// from, the commit it is at and the commits nobody reviewed, each with its author; `unknown` says
// why git could not tell.
export type MergeTake =
  | { held: true }
  | {
      held: false;
      ref: string;
      commit: string;
      added: readonly { commit: string; author: string }[];
    }
  | { unknown: string };

// A commit an action brings in, by its full id, with its subject (the first line of its message),
// for a person to know it by.
export type BroughtCommit = { commit: string; subject: string };

export type Landing = { branch: string; tip?: Tip };
export type Brings = () => readonly string[] | Brought;

function brought(brings: Brings): Brought {
  const asked = brings();
  return Array.isArray(asked) ? { branches: asked } : (asked as Brought);
}

// Git is asked once per check, however many boards read what the action brings in.
function once(brings: Brings): Brings {
  let asked: ReturnType<Brings> | undefined;
  return () => {
    asked ??= brings();
    return asked;
  };
}

// How an approved item gets its changes reviewed again: sent back from its land step to the step
// whose approval led there, or, once Done, reopened. The person does both; the agent asks.
function reviewAgainText(def: BoardDefinition, id: string, position: Position): string {
  if (isClosed(position)) {
    const step = stepById(def, reopenStep(def) ?? '')?.name;
    return `ask the person (otea ask ${id}) to reopen ${id}${step ? ` to ${step}` : ''} so the change is reviewed again`;
  }
  const land = landStepOf(def);
  // A land step with a way back lets the agent take the item back itself (P1-R2-3).
  const back = land && stepById(def, backWaysOf(def, land.id).at(-1) ?? '');
  if (back) {
    return `take ${id} back to ${back.name} (otea handoff ${id} --way "${back.name}" --reason "<why>") so the change is reviewed again`;
  }
  const from = def.steps.find(
    (step) => land !== undefined && step.id !== land.id && waysOf(def, step.id).includes(land.id),
  );
  return `ask the person (otea ask ${id}) to send ${id} back${from ? ` to ${from.name}` : ''} so the change is reviewed again`;
}

const short = (commit: string) => commit.slice(0, 7);

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
  brings: Brings,
): { verdict: GateVerdict; open: boolean; dropped?: boolean; rewrite?: BoardDefinition }[] {
  const keys = boardKeys(board.def, fields);
  if (!keys) return [];
  const guard = guardedBranch(board.def);
  const repo = guard?.guard.repo;
  return selectItems(ctx.db, { collection: board.collection })
    .filter((item) => holds(item, keys, repo))
    .map((item) => {
      const position = positionOf(item.state);
      const round = itemOnBoard(ctx, item, board.def).round;
      const allowedIn = workflowOf(ctx, item).gates?.[gate] ?? [];
      const merged = mergedOf(ctx, item.id) !== undefined;
      const verdict: GateVerdict = {
        id: item.id,
        state: item.state,
        stateName: stateName(board.def, item.state),
        allowed: gateAt(board.def, position, gate).allowed,
        allowedIn,
        allowedInNames: allowedIn.map((state) => stateName(board.def, state)),
        text: gateText(board.def, item.id, position, gate, round, merged),
      };
      const unreviewed =
        !verdict.allowed || !guard
          ? undefined
          : gate === 'push'
            ? landingPushRefusal(ctx, board.def, item, position, guard, brings)
            : mergeRefusal(ctx, board.def, item, position, guard, brings, merged);
      const rewritten =
        verdict.allowed && !unreviewed && guard && gate === 'push'
          ? rewriteRefusal(ctx, board.def, item, position, guard, brings)
          : undefined;
      const refused = unreviewed ?? rewritten;
      if (refused) Object.assign(verdict, { allowed: false, text: refused });
      return {
        verdict,
        open: !isClosed(position),
        dropped: isDropped(position),
        ...(rewritten ? { rewrite: board.def } : {}),
      };
    });
}

// A push of an item's own branch while it is landed, after the person approved it: only what was
// approved, as it is or rebased onto the base with the same result (P3C-R2-1). Undefined when the
// push may go: the item is not being landed, its handoff recorded no tip, or the push holds it.
function landingPushRefusal(
  ctx: Context,
  def: BoardDefinition,
  item: { id: string; fields: Record<string, unknown> },
  position: Position,
  guard: NonNullable<ReturnType<typeof guardedBranch>>,
  brings: Brings,
): string | undefined {
  if (gateAt(def, position, 'merge').why !== 'landing') return undefined;
  const branch = item.fields[guard.id];
  if (typeof branch !== 'string') return undefined;
  const tip = approvedTipOf(ctx, item.id, branch);
  const lands = tip && brought(brings).landsAs;
  if (!tip || !lands || lands([{ branch, tip }], guard.guard.base)) return undefined;
  const base = guard.guard.base;
  const rebased = base
    ? `, as they are or rebased onto ${base} with the same result`
    : ' as they are';
  return `push refused: ${item.id} is being landed in ${placeText(def, position)}: the person approved ${branch} at ${short(tip.commit)}, and this push writes changes nobody reviewed. Push only the approved commits${rebased}; for anything else, ${reviewAgainText(def, item.id, position)}.`;
}

// A push that rewrites an item's branch on the remote (a force push) once the item was handed off
// (P1-R3-3): the remote branch holds what the review read, and another agent may have added to it
// meanwhile; a rewrite would drop both. Before the first handoff a rewrite is the agent's own
// business, and while the item is landed the push is held to what was approved instead
// (landingPushRefusal), where a rebase with the same result passes. Undefined when the push may go.
function rewriteRefusal(
  ctx: Context,
  def: BoardDefinition,
  item: { id: string; fields: Record<string, unknown> },
  position: Position,
  guard: NonNullable<ReturnType<typeof guardedBranch>>,
  brings: Brings,
): string | undefined {
  if (gateAt(def, position, 'merge').why === 'landing') return undefined;
  const branch = item.fields[guard.id];
  if (typeof branch !== 'string' || branch === guard.guard.base) return undefined;
  if (!handedOff(ctx, item.id) || brought(brings).rewrites?.() !== true) return undefined;
  const tip = approvedTipOf(ctx, item.id, branch);
  const at = tip ? ` at ${short(tip.commit)}` : '';
  const base = guard.guard.base;
  const merge = base
    ? `to bring in ${base}, merge it (git merge origin/${base})`
    : 'to bring in the base, merge it';
  return `push refused: ${item.id} was handed off for review${at}, and this push rewrites ${branch} on the remote instead of adding to it: what the review read, and any commit another agent added, would be gone from it. Add commits on top; ${merge} rather than rebase.`;
}

// A merge of an item's own branch once the person approved it, while it is landed (or, on a board
// with no land step, once it is Done and not merged yet): only what was approved, as the remote has
// it now (P3C-R3-1). A forge merges the branch as the remote has it, whatever pushed there since,
// so the gate asks the remote, and refuses when it cannot. Undefined when the merge may go: the
// item is not being merged, its handoff recorded no tip, or the branch holds the approved one.
function mergeRefusal(
  ctx: Context,
  def: BoardDefinition,
  item: { id: string; fields: Record<string, unknown> },
  position: Position,
  guard: NonNullable<ReturnType<typeof guardedBranch>>,
  brings: Brings,
  merged: boolean,
): string | undefined {
  const why = gateAt(def, position, 'merge').why;
  if (why !== 'landing' && (why !== 'done' || merged || landStepOf(def))) return undefined;
  const branch = item.fields[guard.id];
  if (typeof branch !== 'string' || branch === guard.guard.base) return undefined;
  const tip = approvedTipOf(ctx, item.id, branch);
  const takes = tip && !tip.unchanged ? brought(brings).takes : undefined;
  if (!tip || !takes) return undefined;
  const take = takes(tip, guard.guard.base);
  if ('unknown' in take)
    return `merge refused: could not check ${branch} against the commit the person approved of ${item.id}, ${short(tip.commit)}: ${take.unknown}. Merge nothing of it until this check answers; if it keeps failing, ask the person: otea ask ${item.id} "<question>".`;
  if (take.held) return undefined;
  const { added } = take;
  const count = added.length === 1 ? '1 commit' : `${added.length} commits`;
  const shown =
    added
      .slice(0, 5)
      .map(({ commit, author }) => `${commit} by ${author}`)
      .join(', ') + (added.length > 5 ? ', …' : '');
  const what =
    added.length > 0
      ? `, with ${count} nobody reviewed: ${shown}`
      : ', which is not what they approved';
  return `merge refused: the person approved ${branch} at ${short(tip.commit)} for ${item.id}, but ${take.ref} is at ${take.commit}${what}. Merge nothing of it by any means, a forge's included (a script, a CLI or the PR's button): stop and ask the person, otea ask ${item.id} "<question>".`;
}

// Whether an item stands at or past the first step that works on the protected branch: one that
// hands it or pushes it.
function reachedBranch(
  def: BoardDefinition,
  part: Part & { guard: Guard },
  state: string,
): boolean {
  const position = positionOf(state);
  if (isClosed(position)) return true;
  const first = def.steps.findIndex(
    (step) => part.guard.push.includes(step.id) || step.hand.some(({ ref }) => ref === part.id),
  );
  const at = def.steps.findIndex((step) => step.id === position.step);
  return first < 0 || at >= first;
}

// Whether an item ever stood at or past that step, now or in its history: only then may it hold
// work on the branch.
function workedOnBranch(
  ctx: Context,
  def: BoardDefinition,
  part: Part & { guard: Guard },
  item: { id: string; state: string },
): boolean {
  if (reachedBranch(def, part, item.state)) return true;
  return selectEvents(ctx.db, item.id).some(
    ({ type, data }) => type === 'transitioned' && reachedBranch(def, part, String(data.to)),
  );
}

function isDropped(position: Position): boolean {
  return isClosed(position) && position.closed === DROPPED;
}

// A push or merge into the base branch a board protects: allowed only when it brings in the
// branch of at least one of the board's items (in the repo checked) and every such item is Hecho.
function baseCheck(
  ctx: Context,
  board: LiveBoard,
  gate: GateAction,
  fields: Readonly<Record<string, string>>,
  brings: Brings,
): GateCheck & { held: string[]; landing: Landing[]; approved: Approved[] } {
  const branch = guardedBranch(board.def);
  const base = fields.branch ?? '';
  const { branches, unpushed = [] } = brought(brings);
  const names = new Set(branches.filter((name) => name !== base));
  const repo = branch?.guard.repo;
  const matched = selectItems(ctx.db, { collection: board.collection })
    .filter((item) => branch && names.has(item.fields[branch.id] as string))
    .filter(
      (item) =>
        repo === undefined || fields.repo === undefined || sameRepo(item.fields[repo], fields.repo),
    )
    // A dropped item brings nothing in: a duplicate left on the same branch never blocks the item
    // that was done there, and alone it allows nothing.
    .filter((item) => !isDropped(positionOf(item.state)));
  const held = matched.map((item) => (branch ? (item.fields[branch.id] as string) : ''));
  const items = matched.map((item): GateVerdict => {
    const position = positionOf(item.state);
    const round = itemOnBoard(ctx, item, board.def).round;
    const allowedIn = workflowOf(ctx, item).gates?.merge ?? [];
    const ahead = unpushed.find(({ branch: name }) => branch && name === item.fields[branch.id]);
    if (ahead) {
      return {
        id: item.id,
        state: item.state,
        stateName: stateName(board.def, item.state),
        allowed: false,
        allowedIn,
        allowedInNames: allowedIn.map((state) => stateName(board.def, state)),
        text: `${gate} refused: ${ahead.branch} holds commits ${ahead.remote} never got, so nobody reviewed them; ${base} takes ${item.id}'s branch only as it was pushed.`,
      };
    }
    return {
      id: item.id,
      state: item.state,
      stateName: stateName(board.def, item.state),
      allowed: gateAt(board.def, position, 'merge').allowed,
      allowedIn,
      allowedInNames: allowedIn.map((state) => stateName(board.def, state)),
      text: baseGateText(board.def, item.id, position, gate, round, base),
    };
  });
  // An open item whose branch is the base itself works straight on it (a main-only board): a push
  // or merge of the base is its own, allowed by its own step as for any branch. One handed off as
  // no code change brings nothing in, so a push never waits on it (P2S-R3-3).
  const onBase = selectItems(ctx.db, { collection: board.collection })
    .filter((item) => branch && base !== '' && item.fields[branch.id] === base)
    .filter(
      (item) =>
        repo === undefined || fields.repo === undefined || sameRepo(item.fields[repo], fields.repo),
    )
    .filter((item) => !isClosed(positionOf(item.state)))
    .filter((item) => !approvedTipOf(ctx, item.id, base)?.unchanged)
    // On a board whose Rama starts at the base (P2S-R3-10), every new item names it before any work:
    // one that never reached the step that hands or pushes the branch made no commit there, so a
    // push of the base does not wait on it.
    .filter(
      (item) => !branch || branch.initial !== base || workedOnBranch(ctx, board.def, branch, item),
    );
  const own = onBase.map((item): GateVerdict => {
    const position = positionOf(item.state);
    const round = itemOnBoard(ctx, item, board.def).round;
    const allowedIn = workflowOf(ctx, item).gates?.[gate] ?? [];
    // Its land step lands it on the base, which on its own branch is a push of the base.
    const landing = gateAt(board.def, position, 'merge').why === 'landing';
    return {
      id: item.id,
      state: item.state,
      stateName: stateName(board.def, item.state),
      allowed: landing || gateAt(board.def, position, gate).allowed,
      allowedIn,
      allowedInNames: allowedIn.map((state) => stateName(board.def, state)),
      text: landing
        ? baseGateText(board.def, item.id, position, gate, round, base)
        : gateText(board.def, item.id, position, gate, round),
    };
  });
  const all = [...items, ...own];
  // What each item brought in lands: its branch at the tip the person approved, when its handoff
  // recorded one; on its own branch, the base itself.
  const landing: Landing[] = [];
  const approved: Approved[] = [];
  for (const item of [...matched, ...onBase]) {
    const name = branch ? (item.fields[branch.id] as string) : '';
    const tip = approvedTipOf(ctx, item.id, name);
    landing.push(tip ? { branch: name, tip } : { branch: name });
    if (tip)
      approved.push({
        id: item.id,
        tip,
        again: reviewAgainText(board.def, item.id, positionOf(item.state)),
      });
  }
  return {
    gate,
    allowed: all.length > 0 && all.every(({ allowed }) => allowed),
    items: all,
    held: own.length > 0 ? [...held, base] : held,
    landing,
    approved,
  };
}

type Approved = { id: string; tip: Tip; again: string };

// Why a push or merge into a base branch is refused when what it writes is not what the person
// approved of the items it brings in (P3C-R2-1): commits added after the approval, a rebase with
// another result, or a merge whose conflicts the review never saw.
function unapprovedRefusal(gate: string, base: string, approved: readonly Approved[]): string {
  const which = approved
    .map(({ id, tip }) => `${id} (${short(tip.commit)} on ${tip.branch})`)
    .join(', ');
  const again = approved.map(({ again }) => again).join('; ');
  return `${gate} refused: ${base} would not hold exactly what the person approved of ${which}: it brings in changes nobody reviewed, or a merge whose conflicts the review never saw. Bring in the approved commits as they are, or rebased onto ${base} with the same result; for anything else, ${again}.`;
}

// The commits of a refusal as a reader knows them: each short id with its subject, five at most.
function commitsShown(commits: readonly BroughtCommit[]): string {
  const shown = commits
    .slice(0, 5)
    .map(({ commit, subject }) => (subject ? `${short(commit)} (${subject})` : short(commit)));
  return shown.join(', ') + (commits.length > 5 ? ', …' : '');
}

// Why a push or merge into a base branch is refused when it brings in commits that no branch of an
// approved item holds and no approved or Done item records as its own (P5-R3-3): nobody approved
// them, whatever the steps of the items it brings in say. What the agent does about it: record a
// commit on the approved item that made it, or push nothing of it.
function strayRefusal(
  gate: string,
  base: string,
  defs: readonly BoardDefinition[],
  commits: readonly BroughtCommit[],
): string {
  const count = commits.length === 1 ? '1 commit' : `${commits.length} commits`;
  const names = defs.map((def) => def.name).join(' and ');
  const verb = defs.length > 1 ? 'protect' : 'protects';
  const example = short(commits[0]?.commit ?? '<commit>');
  return `${gate} refused: ${base} would take ${count} that no approved item holds on its branch or records as its own: ${commitsShown(commits)}. ${names} ${verb} ${base}: it takes only the branches of approved items, as they were pushed, and the commits an approved or Done item records by its id. If an approved item made it, record it on that item: while it is landed, in the field its step asks for (otea update <id> --field "<field>=${example}"); once it is Done, with otea merged <id> --commit ${example}. If no approved item made it, push nothing of it: ask the person, otea ask <id> "<question>".`;
}

// An id of a commit as an item records it in a field: 7 to 40 hex digits, a word of its own.
const COMMIT_ID = /\b[0-9a-f]{7,40}\b/gi;

function commitIds(value: unknown): string[] {
  return typeof value === 'string'
    ? (value.match(COMMIT_ID) ?? []).map((id) => id.toLowerCase())
    : [];
}

// An approved or Done item of a board that guards a branch, and the commits it records as its
// own (P5-R3-3): a board that commits approved work straight on the base, in its land step, writes
// each commit's id in a field of the item (Commit en main), and otea merged --commit records one on
// a Done item. Each id holds that one commit, matched as a prefix. `tip`: what its handoff
// recorded of the base itself, on a board that works straight on it, which holds the commits under
// it, as a branch does.
type CommitRecord = {
  item: ItemRecord;
  def: BoardDefinition;
  ids: string[];
  tip?: string;
};

function recordsOf(
  ctx: Context,
  boards: readonly LiveBoard[],
  fields: Readonly<Record<string, string>>,
  base: string,
): CommitRecord[] {
  return boards.flatMap((board) => {
    const branch = guardedBranch(board.def);
    if (!branch) return [];
    const repo = branch.guard.repo;
    return selectItems(ctx.db, { collection: board.collection }).flatMap((item): CommitRecord[] => {
      const position = positionOf(item.state);
      if (isDropped(position) || !gateAt(board.def, position, 'merge').allowed) return [];
      if (
        repo !== undefined &&
        fields.repo !== undefined &&
        !sameRepo(item.fields[repo], fields.repo)
      )
        return [];
      const ids = [
        ...Object.values(item.fields).flatMap(commitIds),
        ...commitIds(mergedOf(ctx, item.id)?.commit),
      ];
      const tip = approvedTipOf(ctx, item.id, base);
      const held = tip && !tip.unchanged ? { tip: tip.commit } : {};
      return ids.length > 0 || held.tip ? [{ item, def: board.def, ids, ...held }] : [];
    });
  });
}

// What the approved and Done items record of the commits a push of the base brings in, when it
// brings in no item's branch: each item with the commits of the push that are its own, and the
// commits none of them records. Undefined when git cannot list what the push brings in (the remote
// has no base yet), or the push brings in no commit at all.
function recordedTake(
  records: readonly CommitRecord[],
  outside: NonNullable<Brought['outside']>,
):
  | { taken: { record: CommitRecord; commits: BroughtCommit[] }[]; left: BroughtCommit[] }
  | undefined {
  const every = outside([]);
  if (every.length === 0) return undefined;
  const taken = records.flatMap((record) => {
    const underTip = record.tip
      ? new Set(outside([], [record.tip]).map(({ commit }) => commit))
      : undefined;
    const commits = every.filter(
      ({ commit }) =>
        record.ids.some((id) => commit.toLowerCase().startsWith(id)) ||
        (underTip !== undefined && !underTip.has(commit)),
    );
    return commits.length > 0 ? [{ record, commits }] : [];
  });
  const owned = new Set(taken.flatMap(({ commits }) => commits.map(({ commit }) => commit)));
  return { taken, left: every.filter(({ commit }) => !owned.has(commit)) };
}

// What otea check answers for an item whose recorded commits a push of the base takes.
function recordedVerdict(
  ctx: Context,
  gate: GateAction,
  base: string,
  { record, commits }: { record: CommitRecord; commits: readonly BroughtCommit[] },
): GateVerdict {
  const { item, def } = record;
  const position = positionOf(item.state);
  const allowedIn = workflowOf(ctx, item).gates?.merge ?? [];
  const where = isClosed(position)
    ? `is ${DONE_NAME}`
    : `is being landed in ${placeText(def, position)}, after the person's approval,`;
  const ids = commits.map(({ commit }) => short(commit));
  const listed =
    ids.length > 5 ? `${ids.slice(0, 5).join(', ')} and ${ids.length - 5} more` : ids.join(', ');
  return {
    id: item.id,
    state: item.state,
    stateName: stateName(def, item.state),
    allowed: true,
    allowedIn,
    allowedInNames: allowedIn.map((state) => stateName(def, state)),
    text: `${gate} allowed: ${item.id} ${where} and records ${listed} as its own; ${base} takes ${ids.length === 1 ? 'it' : 'them'}.`,
  };
}

// Checks the items whose fields hold every value given and whose workflow gates the action: on a
// board, its protected branch (and the repo its guard reads), matched by their hidden ids and
// answered by the step engine; on a collection still on a preset, its workflow's gates. The open
// ones are checked when there are any; otherwise the closed ones, since a closed state can allow an
// action too (merging what was approved). A push or merge into a branch a board protects as its
// base is checked against the items whose branches it brings in (`brings`; none when not given).
export function checkGate(
  ctx: Context,
  gate: string,
  fields: Record<string, string>,
  asked: Brings = () => [],
): GateCheck {
  const brings = once(asked);
  const boards = liveBoards(ctx);
  const onBoards = new Set(boards.map(({ collection }) => collection));
  assertKnownGate(ctx, gate, onBoards);
  assertKnownKeys(ctx, boards, onBoards, fields);
  const bases = GATED.includes(gate)
    ? boards.filter(
        ({ def }) =>
          fields.branch !== undefined && guardedBranch(def)?.guard.base === fields.branch,
      )
    : [];
  if (bases.length > 0) {
    const check = baseVerdict(ctx, boards, bases, gate, fields, brings);
    if (check.allowed || gate !== 'push') return check;
    const defs = bases.map(({ def }) => def);
    const person = check.stray
      ? commitsForPersonText(defs, fields.branch ?? '', check.stray)
      : forPersonText(defs);
    return { ...check, person };
  }
  const fromBoards = GATED.includes(gate)
    ? boards.flatMap((board) => boardVerdicts(ctx, board, gate as GateAction, fields, brings))
    : [];
  const fromPresets = presetVerdicts(ctx, gate, fields, onBoards);
  const gated: {
    verdict: GateVerdict;
    open: boolean;
    dropped?: boolean;
    rewrite?: BoardDefinition;
  }[] = [...fromBoards, ...fromPresets];
  const open = gated.filter((entry) => entry.open);
  // Of the closed ones, a dropped duplicate left on the branch never blocks the item that was done
  // there; dropped ones alone still answer (and allow nothing).
  const kept = gated.filter((entry) => !entry.dropped);
  const closed = kept.length > 0 ? kept : gated;
  const answered = open.length > 0 ? open : closed;
  const items = answered.map(({ verdict }) => verdict);
  // Where a board protects a base, a push takes only a branch an item names (P5-R3-2): one no item
  // names is no item's work, and Otea never lets through what no board lets through.
  const guarding = boards.filter(({ def }) => guardedBranch(def)?.guard.base !== undefined);
  if (items.length === 0 && gate === 'push' && fields.branch !== undefined && guarding.length > 0) {
    const defs = guarding.map(({ def }) => def);
    return {
      gate,
      allowed: false,
      items,
      refusal: unnamedBranchRefusal(defs, fields.branch),
      person: branchForPersonText(defs),
    };
  }
  const check: GateCheck = { gate, allowed: items.every(({ allowed }) => allowed), items };
  if (items.length === 0) check.note = `no item with a ${gate} gate matches`;
  // A person who means to rewrite the branch pushes it themselves, past the hook (P1-R3-3).
  const rewritten = answered.find(({ rewrite }) => rewrite !== undefined)?.rewrite;
  if (rewritten) check.person = rewriteForPersonText(rewritten);
  return check;
}

// The base branches the project's live boards protect (guard.base), each once, for the forge to
// enforce (otea hook install --forge).
export function protectedBases(ctx: Context): string[] {
  const bases = liveBoards(ctx).flatMap(({ def }) => guardedBranch(def)?.guard.base ?? []);
  return [...new Set(bases)].sort();
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
): { verdict: GateVerdict; open: boolean; dropped?: boolean }[] {
  // An error here fails the check closed: an item Otea cannot read is never allowed by silence.
  const { repo, ...exact } = fields;
  const items: Item[] = listItems(ctx, { fields: exact }).filter(
    (item) =>
      !onBoards.has(item.collection) && (repo === undefined || sameRepo(item.fields.repo, repo)),
  );
  return items.flatMap((item) => {
    const allowedIn = workflowOf(ctx, item).gates?.[gate];
    if (!allowedIn) return [];
    // A preset's states are its words already.
    const verdict = {
      id: item.id,
      state: item.state,
      stateName: item.state,
      allowed: allowedIn.includes(item.state),
      allowedIn,
      allowedInNames: allowedIn,
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

// A push or merge into a base branch boards protect (checkGate): every board that protects it is
// asked at once.
function baseVerdict(
  ctx: Context,
  boards: readonly LiveBoard[],
  bases: readonly LiveBoard[],
  gate: string,
  fields: Record<string, string>,
  brings: Brings,
): GateCheck {
  // Every board that protects the base is asked at once: the action must bring in an item of
  // one of them, and every item it brings in, whatever its board, must allow it. A board that
  // leaves the base alone still lands its own items into it: an item of it that the action
  // brings in counts like theirs, by its own board's steps, so their protection never blocks the
  // land step of another board (Errores pushing its approved fix to main).
  const guarding = boards.filter(({ def }) => guardedBranch(def) !== undefined);
  const checks = guarding.map((board) => baseCheck(ctx, board, gate as GateAction, fields, brings));
  const items = checks.flatMap((check) => check.items);
  const base = fields.branch ?? '';
  const defs = bases.map(({ def }) => def);
  const outside = brought(brings).outside;
  if (items.length === 0) {
    // It brings in no item's branch: it may still bring in only commits that approved or Done
    // items record as their own (P5-R3-3), a board that commits approved work straight on the base.
    const take = outside
      ? recordedTake(recordsOf(ctx, guarding, fields, base), outside)
      : undefined;
    if (take && take.left.length === 0) {
      const taken = take.taken.map((one) => recordedVerdict(ctx, gate as GateAction, base, one));
      return { gate, allowed: true, items: taken };
    }
    if (take)
      return {
        gate,
        allowed: false,
        items,
        refusal: strayRefusal(gate, base, defs, take.left),
        stray: take.left,
      };
    return {
      gate,
      allowed: false,
      items,
      refusal: baseRefusal(defs, gate as GateAction, base),
    };
  }
  const allowed = items.every((item) => item.allowed);
  // Every item brought in may land, but the action must not bring in more than their branches:
  // a commit made on the base, or on a branch no item has, rides along unreviewed.
  const stray = allowed ? (outside?.(checks.flatMap(({ held }) => held)) ?? []) : [];
  if (stray.length > 0) {
    return {
      gate,
      allowed: false,
      items,
      refusal: strayRefusal(gate, base, defs, stray),
      stray,
    };
  }
  // Every branch it brings in is one the person approved: what it writes must be exactly that,
  // merged onto the base as the remote has it. Checked once a handoff recorded an approved tip.
  const approved = checks.flatMap((check) => check.approved);
  const lands = allowed && approved.length > 0 ? brought(brings).landsAs : undefined;
  if (lands && !lands(checks.flatMap((check) => check.landing))) {
    return {
      gate,
      allowed: false,
      items,
      refusal: unapprovedRefusal(gate, fields.branch ?? '', approved),
    };
  }
  return { gate, allowed, items };
}
