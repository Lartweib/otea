import {
  type GateAnswer,
  gateAt,
  isClosed,
  type Linked,
  NOTE_REF,
  positionOf,
  roundsOf,
  turnAt,
} from '../../../../src/core/board/engine.ts';
import { handoffNotes, historyOf, roundsOfStep } from '../../../../src/core/board/history.ts';
import {
  type BoardDefinition,
  DONE,
  guardedBranch,
  isEvidence,
  type Part,
  type Step,
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

type ItemLike = { state: string; createdAt: string; events: readonly ItemEvent[] };

// The item's history as the engine replays it (core/board/history.ts, as the server reads it).
const historyFor = (def: BoardDefinition, events: readonly ItemEvent[], createdAt: string) =>
  historyOf(events, { initial: def.steps[0]?.id ?? '', createdAt });

// Null when the item's state is not one of the board's (a collection still on a preset, or a
// dropped item, which the route has no stop for).
export function boardItemOf(
  def: BoardDefinition,
  item: ItemLike,
  words: RouteWords,
): BoardItem | null {
  const position = positionOf(item.state);
  if (isClosed(position) ? position.closed !== DONE : !stepById(def, position.step)) return null;
  const history = historyFor(def, item.events, item.createdAt);
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
  // While its step is being done: what the handoff still lacks (parts by ref, `note`, the waits).
  missing?: { ref: string; name: string; reason: string }[];
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

// The rounds of the step as the engine counts them, each with what the send-back that opened it
// said and the notes of the handoffs made in it, oldest first.
export function roundNotes(
  def: BoardDefinition,
  stepId: string,
  events: readonly ItemEvent[],
): Round[] {
  const created = events.find(({ type }) => type === 'created')?.at ?? '';
  const history = historyFor(def, events, created);
  const rounds: Round[] = roundsOfStep(def, history, stepId).map(({ round, back }) => ({
    round,
    notes: back?.said.text
      ? [
          {
            kind: 'back',
            text: back.said.text.trim(),
            by: back.said.reading ? '' : back.said.by.name,
            person: back.said.by.kind === 'human',
            at: back.at,
          },
        ]
      : [],
  }));
  if (rounds.length === 0) rounds.push({ round: 1, notes: [] });
  for (const n of handoffNotes(def, history)) {
    // The question a reading carried is already the next round's note.
    if (n.step !== stepId || n.at === history.readAt) continue;
    const round = rounds.find(({ round: r }) => r === n.round) ?? rounds.at(-1);
    round?.notes.push({
      kind: 'handoff',
      text: n.note.trim(),
      by: n.by.name,
      person: n.by.kind === 'human',
      at: n.at,
    });
  }
  for (const r of rounds) r.notes.sort((a, b) => a.at.localeCompare(b.at));
  return rounds;
}

// On a board nothing waits by itself: a step that waits for its parts is the doer's to finish, and
// the wait is a check at the handoff (its checklist says what is still open). So open parts never
// make the item "waiting" there, the look an item on a preset took while its children were open.
export function sheetLook(look: Look, onBoard: boolean): Look {
  return onBoard && look === 'waiting' ? 'queued' : look;
}

// Where a way back (or a send-back) lands: the round it starts on that step, as the engine counts
// rounds, and the step's own agent (none when any agent may take it).
export function backOf(
  def: BoardDefinition,
  item: ItemLike,
  to: string,
): { agent: string | null; round: number } {
  const target = positionOf(to);
  if (isClosed(target)) return { agent: null, round: 0 };
  const history = historyFor(def, item.events, item.createdAt);
  const rounds = roundsOf(def, history.initial, history.createdAt, history.moves);
  const turn = turnAt(def, { step: target.step, phase: 'doing' });
  const agent = turn.who === 'agent' ? (turn.agent ?? null) : null;
  return { agent, round: (rounds.rounds[target.step] ?? 0) + 1 };
}

// The step the person does while it is being done (Propuesta, Triar): their own step, whoever
// handed it to them. Undefined on an agent's step, in a review and once closed.
export function ownStepOf(
  def: BoardDefinition,
  item: { state: string; turn: string },
): Step | undefined {
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase !== 'doing' || item.turn !== 'human') return undefined;
  const step = stepById(def, position.step);
  return step?.doer === 'you' ? step : undefined;
}

// The handoff checklist of the person's own step (the mock's itemChecklist): the note when the step
// asks for one, then each part it hands, done unless the engine still finds it missing.
export type HandRow = {
  ref: string;
  name: string;
  ok: boolean;
  required: boolean;
  // A field the page can fill in place ("Rellenar"); evidence is attached by an agent.
  part?: Part;
};

export function handRows(
  def: BoardDefinition,
  step: Step,
  missing: readonly { ref: string }[],
): HandRow[] {
  const lacks = new Set(missing.map(({ ref }) => ref));
  const rows: HandRow[] = [];
  if (step.note.req === 'always') {
    rows.push({ ref: NOTE_REF, name: t('bi.hand.note'), ok: !lacks.has(NOTE_REF), required: true });
  }
  for (const hand of step.hand) {
    const part = def.parts[hand.ref];
    if (!part) continue;
    rows.push({
      ref: hand.ref,
      name: part.name,
      ok: !lacks.has(hand.ref),
      required: hand.req !== 'no',
      ...(isEvidence(part) ? {} : { part }),
    });
  }
  return rows;
}

// Entregar on the person's own step, in the page's words, while a part it hands is missing (the
// note is asked for by the notes form instead).
export function handRefusal(
  id: string,
  missing: readonly { ref: string; name: string; reason: string }[],
): string | null {
  const parts = missing.filter(({ ref, reason }) => ref !== NOTE_REF && reason !== 'open');
  if (!parts.length) return null;
  return t('bi.refuse.missing', {
    id,
    list: listOf(parts.map(({ name }) => name)),
    count: parts.length,
  });
}
