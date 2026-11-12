import {
  type GateAnswer,
  gateAt,
  isClosed,
  type Linked,
  positionOf,
  roundsOf,
  stateOf,
  type Transition,
  turnAt,
} from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  DONE,
  guardedBranch,
  stepById,
} from '../../../../src/core/board/model.ts';
import {
  type DefinitionRoute,
  definitionRoute,
  type RouteWords,
} from '../../board-studio/preview/route.ts';
import { listOf, t } from '../../i18n/i18n.ts';
import type { Look } from '../../lanes/looks.ts';
import type { ItemEvent, RelatedItem } from '../../types.ts';

// An item on a published board, as the step engine reads it: the agent whose turn it is by the
// board (the step's own agent, or the reviewer's), the round of the step it is on, and its route
// drawn from the definition, the same route Studio's preview draws. The preset the board compiles
// to knows only "an agent" and a column per review, so the item page asks the board instead.

export type BoardItem = { agent: string | null; round: number; route: DefinitionRoute };

const MIGRATE = 'migrate';

type ItemLike = { state: string; createdAt: string; events: readonly ItemEvent[] };

const transitionsOf = (events: readonly ItemEvent[]): Transition[] =>
  events.flatMap((e) =>
    e.type === 'transitioned' && typeof e.data.from === 'string' && typeof e.data.to === 'string'
      ? [{ from: e.data.from, to: e.data.to, at: e.at }]
      : [],
  );

// The item's history as the engine replays it (app/next.ts): a board read from a preset starts at
// that reading, and the question the reading carried opens the step's next round.
function historyOf(
  item: ItemLike,
  fallback: string,
): { initial: string; createdAt: string; moves: Transition[] } {
  const events = item.events;
  const at = events.findLastIndex((e) => e.type === 'transitioned' && e.data.reason === MIGRATE);
  const reading = events[at];
  if (!reading || typeof reading.data.to !== 'string') {
    const created = events.find((e) => e.type === 'created')?.data.state;
    const initial = typeof created === 'string' ? created : fallback;
    return { initial, createdAt: item.createdAt, moves: transitionsOf(events) };
  }
  const to = positionOf(reading.data.to);
  const asked = typeof reading.data.note === 'string' && reading.data.note.trim() !== '';
  const reopen: Transition[] =
    asked && !isClosed(to)
      ? [{ from: stateOf({ step: to.step, phase: 'review' }), to: to.step, at: reading.at }]
      : [];
  return {
    initial: reading.data.to,
    createdAt: reading.at,
    moves: [...reopen, ...transitionsOf(events.slice(at + 1))],
  };
}

// Null when the item's state is not one of the board's (a collection still on a preset, or a
// dropped item, which the route has no stop for).
export function boardItemOf(
  def: BoardDefinition,
  item: ItemLike,
  words: RouteWords,
): BoardItem | null {
  const position = positionOf(item.state);
  if (isClosed(position) ? position.closed !== DONE : !stepById(def, position.step)) return null;
  const history = historyOf(item, def.steps[0]?.id ?? item.state);
  const rounds = roundsOf(def, history.initial, history.createdAt, history.moves);
  const turn = turnAt(def, position);
  const agent = turn.who === 'agent' ? (turn.agent ?? null) : null;
  const round = isClosed(position) ? 0 : (rounds.rounds[position.step] ?? 1);
  const at = isClosed(position) ? DONE : { step: position.step, phase: position.phase };
  return { agent, round, route: definitionRoute(def, at, rounds.dips, words) };
}

// ---- what the item page reads of a board item (PLAN §9.1) ----

// The `board` block of a board item's JSON (GET /api/items/:id), as the agents slice sends it.
export type ItemBoardBlock = {
  parts: Linked[];
  partsBoard: string | null;
  blockers: Linked[];
  blocking: Linked[];
  notes: { step: string; round: number; note: string; at: string; by: string }[];
  gates: { push: GateAnswer; merge: GateAnswer } | null;
  branch: { value: string; repo?: string } | null;
};

// An item the page lists: where it stands (board and step by name, or closed) and, when the item's
// relations know it, its title, state and turn, to draw its node.
export type LinkedView = Linked & {
  title?: string;
  state?: string;
  turn?: RelatedItem['turn'];
  ended?: RelatedItem['closes'];
};

export type ItemLinks = {
  parent: LinkedView | null;
  parts: LinkedView[];
  partsBoard: string | null;
  blockers: LinkedView[];
  blocking: LinkedView[];
};

type Names = (related: RelatedItem) => { board: string; step?: string };

const viewOf = (related: RelatedItem, names: Names): LinkedView => {
  const { board, step } = names(related);
  return {
    id: related.id,
    board,
    ...(step === undefined ? {} : { step }),
    closed: related.closes !== undefined,
    title: related.title,
    state: related.state,
    turn: related.turn,
    ...(related.closes ? { ended: related.closes } : {}),
  };
};

// Its parts, its parent and what it holds back or is held back by: the server's board block when
// it sends one (the board and step names it read), else the item's own relations.
export function linksOf(
  item: { relations: readonly RelatedItem[]; board?: ItemBoardBlock | undefined },
  names: Names,
): ItemLinks {
  const of = (kind: RelatedItem['kind']) =>
    item.relations.filter((r) => r.kind === kind).map((r) => viewOf(r, names));
  const parentRel = item.relations.find((r) => r.kind === 'parent');
  const block = item.board;
  const known = new Map(item.relations.map((r) => [r.id, viewOf(r, names)]));
  const merged = (list: readonly Linked[]) =>
    list.map((linked) => ({ ...known.get(linked.id), ...linked }));
  return {
    parent: parentRel ? viewOf(parentRel, names) : null,
    parts: block ? merged(block.parts) : of('child'),
    partsBoard: block?.partsBoard ?? null,
    blockers: block ? merged(block.blockers) : of('blocked_by'),
    blocking: block ? merged(block.blocking) : of('blocks'),
  };
}

export function partsCount(parts: readonly Linked[]): {
  total: number;
  open: number;
  ended: number;
} {
  const open = parts.filter((p) => !p.closed).length;
  return { total: parts.length, open, ended: parts.length - open };
}

// What a step waits for ("Algo que esperar"), in the step's order: the open parts or blockers.
export type WaitRow = { kind: 'parts' | 'blockers'; open: LinkedView[]; total: number };

export function waitRows(def: BoardDefinition, stepId: string, links: ItemLinks): WaitRow[] {
  const step = stepById(def, stepId);
  if (!step) return [];
  return (['parts', 'blockers'] as const)
    .filter((kind) => step.waits.includes(kind))
    .map((kind) => {
      const all = kind === 'parts' ? links.parts : links.blockers;
      return { kind, open: all.filter((x) => !x.closed), total: all.length };
    });
}

// The refusal Aprobar answers in the page's words while a wait no longer holds (the engine's
// approve with the item's facts says the same to agents, in English).
export function approvalRefusal(id: string, rows: readonly WaitRow[]): string | null {
  const parts = rows.find((r) => r.kind === 'parts' && r.open.length);
  if (parts) {
    const list = listOf(parts.open.map((x) => (x.step ? `${x.id} (${x.step})` : x.id)));
    return t('bi.refuse.parts', { id, list, count: parts.open.length });
  }
  const blockers = rows.find((r) => r.kind === 'blockers' && r.open.length);
  const first = blockers?.open[0];
  if (!first) return null;
  return first.step
    ? t('bi.refuse.blockers', { id, other: first.id, board: first.board, step: first.step })
    : t('bi.refuse.blockersEnded', { id, other: first.id, board: first.board });
}

// The protected branch in one line, after the buttons: may it be pushed, is it frozen in review,
// may it be merged (F10). The engine's gate answers, as otea check does.
export type BranchStrip = {
  tone: 'ok' | 'frozen' | 'off';
  key: 'push' | 'frozen' | 'merge' | 'closed' | 'noPush';
  value: string;
  repo?: string;
  step?: string;
};

export function branchStrip(
  def: BoardDefinition,
  state: string,
  fields: Readonly<Record<string, string>>,
): BranchStrip | null {
  const branch = guardedBranch(def);
  const value = branch ? fields[branch.id]?.trim() : undefined;
  if (!branch || !value) return null;
  const repoValue = branch.guard.repo ? fields[branch.guard.repo]?.trim() : undefined;
  const repo = repoValue ? { repo: repoValue } : {};
  const position = positionOf(state);
  if (isClosed(position)) {
    return position.closed === DONE
      ? { tone: 'ok', key: 'merge', value, ...repo }
      : { tone: 'off', key: 'closed', value, ...repo };
  }
  const step = stepById(def, position.step)?.name ?? position.step;
  if (position.phase !== 'doing') return { tone: 'frozen', key: 'frozen', value, ...repo, step };
  return gateAt(def, position, 'push').allowed
    ? { tone: 'ok', key: 'push', value, ...repo, step }
    : { tone: 'off', key: 'noPush', value, ...repo, step };
}

// Each round of a step with its notes (Rondas): the handoff's note ("Nota de la entrega", which
// the compiled board keeps as the handoff's reason) closes a round; the person's send-back reason,
// a way back into the step ("Devolver a Completar") or a migration's question opens the next.
// `person`: the person wrote it (a send-back, a Devolver, the question a migration carried); `by`
// is empty when nobody can be named (a migration).
export type RoundNote = {
  kind: 'handoff' | 'back';
  text: string;
  by: string;
  person: boolean;
  at: string;
};
export type Round = { round: number; notes: RoundNote[] };

// What a move said: its note, else its reason; a migration's reason is a marker, not words.
const textOf = (data: Record<string, unknown>): string => {
  const said =
    typeof data.note === 'string' ? data.note : data.reason === MIGRATE ? '' : data.reason;
  return typeof said === 'string' ? said.trim() : '';
};

export function roundNotes(
  def: BoardDefinition,
  stepId: string,
  events: readonly ItemEvent[],
  block?: ItemBoardBlock,
): Round[] {
  const index = def.steps.findIndex((s) => s.id === stepId);
  const stepName = def.steps[index]?.name;
  // Rounds count as the step engine counts them (roundsOf): each time the item enters the step.
  const rounds: Round[] = [];
  const add = (n: number, note: RoundNote) => rounds[n - 1]?.notes.push(note);
  const indexOf = (step: string) => def.steps.findIndex((s) => s.id === step);
  // Like the engine, a board read from a preset starts the item's history at that reading: the
  // preset's states before it are not the board's steps.
  const reading = events.findLastIndex(
    (e) => e.type === 'transitioned' && e.data.reason === MIGRATE,
  );
  const readAt = reading < 0 ? undefined : events[reading]?.at;
  for (const e of reading < 0 ? events : events.slice(reading)) {
    if (e.type === 'created' && typeof e.data.state === 'string') {
      const at = positionOf(e.data.state);
      if (!isClosed(at) && at.step === stepId) rounds.push({ round: 1, notes: [] });
    }
    if (e.type !== 'transitioned') continue;
    const { from, to } = e.data;
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    const source = positionOf(from);
    const target = positionOf(to);
    const text = textOf(e.data);
    const migrated = e.data.reason === MIGRATE;
    const note = (kind: RoundNote['kind']): RoundNote => ({
      kind,
      text,
      by: migrated ? '' : e.actor.name,
      person: e.actor.kind === 'human',
      at: e.at,
    });
    const intoStep = !isClosed(target) && target.step === stepId && target.phase === 'doing';
    const fromStep = !isClosed(source) && source.step === stepId;
    const fromLater = !isClosed(source) && indexOf(source.step) > index;
    const sentBack = fromStep && source.phase !== 'doing';
    // Its words are the round's note when it came back (from its review or a later step) or a
    // migration brought the person's question; moving on, forward, with a word says nothing here.
    const back = sentBack || fromLater || migrated;
    if (migrated) {
      // The reading is the step's first round; the question it carried opens the next one.
      if (!intoStep) continue;
      rounds.push({ round: 1, notes: [] });
      if (text) rounds.push({ round: 2, notes: [note('back')] });
    } else if (intoStep && !(fromStep && source.phase === 'doing')) {
      rounds.push({ round: rounds.length + 1, notes: back && text ? [note('back')] : [] });
    } else if (fromStep && source.phase === 'doing' && text && !block) {
      add(rounds.length, note('handoff'));
    }
  }
  if (rounds.length === 0) rounds.push({ round: 1, notes: [] });
  if (block) {
    for (const n of block.notes) {
      if (n.step !== stepId && n.step !== stepName) continue;
      if (!n.note.trim()) continue;
      // The question a reading carried is already the next round's note.
      if (n.at === readAt) continue;
      add(Math.min(Math.max(n.round, 1), rounds.length), {
        kind: 'handoff',
        text: n.note.trim(),
        by: n.by,
        person: false,
        at: n.at,
      });
    }
    for (const r of rounds) r.notes.sort((a, b) => a.at.localeCompare(b.at));
  }
  return rounds;
}

// On a board nothing waits by itself: a step that waits for its parts is the doer's to finish, and
// the wait is a check at the handoff (its checklist says what is still open). So open parts never
// make the item "waiting" there, the look an item on a preset took while its children were open.
export function sheetLook(look: Look, onBoard: boolean): Look {
  return onBoard && look === 'waiting' ? 'queued' : look;
}
