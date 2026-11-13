import {
  type BoardDefinition,
  CHOICE_KINDS,
  DONE,
  DROPPED,
  defaultWay,
  guardedBranch,
  isEvidence,
  motiveById,
  type Part,
  partOf,
  SAME,
  type Step,
  stepById,
  stepIndex,
  type Target,
  TITLE,
} from './model.ts';

// The step engine: the one place that says where an item stands, whose turn it is, what a handoff
// still lacks, where an approval or a send-back takes it and which round it is in. The server's
// next and handoff, the MCP tools, the CLI, Studio's previews and Probar all call it, so what the
// person designs is what the agents meet.

// The phases of a step: `doing` (the doer's) and `review` (the reviewer's).
export type Phase = 'doing' | 'review';

export type Closed = typeof DONE | typeof DROPPED;

// A discard on a board with motives names one (`motive`, a motive id).
export type Position = { step: string; phase: Phase } | { closed: Closed; motive?: string };

const SUFFIX: Readonly<Record<Phase, string>> = { doing: '', review: '__review' };

// The person's review an older board kept apart (when its named agent reviewer had done the work
// itself): it reads as the step's review.
const YOURS = '__yours';

const MOTIVE_PREFIX = `${DROPPED}__`;

// The workflow state a position compiles to: the step id while doing, `<id>__review` for its
// review, `done` and `dropped` when closed, and `dropped__<motive>` for a discard with a motive.
export function stateOf(position: Position): string {
  if ('closed' in position) {
    if (position.closed === DROPPED && position.motive) return MOTIVE_PREFIX + position.motive;
    return position.closed;
  }
  return position.step + SUFFIX[position.phase];
}

export function positionOf(state: string): Position {
  if (state === DONE || state === DROPPED) return { closed: state };
  if (state.startsWith(MOTIVE_PREFIX))
    return { closed: DROPPED, motive: state.slice(MOTIVE_PREFIX.length) };
  for (const suffix of [SUFFIX.review, YOURS]) {
    if (state.endsWith(suffix)) return { step: state.slice(0, -suffix.length), phase: 'review' };
  }
  return { step: state, phase: 'doing' };
}

export function isClosed(position: Position): position is { closed: Closed } {
  return 'closed' in position;
}

function positionAt(target: Target): Position {
  return target === DONE ? { closed: DONE } : { step: target, phase: 'doing' };
}

// The ways out of a step: the default (the next step, or Hecho) first, then the alternatives that
// still lead somewhere later, each once.
export function waysOf(def: BoardDefinition, stepId: string): Target[] {
  const index = stepIndex(def, stepId);
  const step = def.steps[index];
  if (!step) return [];
  const later = (target: Target) => target === DONE || stepIndex(def, target) > index;
  return [...new Set([defaultWay(def, stepId), ...step.ways.filter(later)])];
}

// The earlier steps the doer may take the item back to ("o regresarlo a…"), in row order.
export function backWaysOf(def: BoardDefinition, stepId: string): string[] {
  const index = stepIndex(def, stepId);
  const step = def.steps[index];
  if (!step) return [];
  return def.steps
    .slice(0, index)
    .map(({ id }) => id)
    .filter((id) => step.ways.includes(id));
}

export type Turn = { who: 'you' } | { who: 'agent' } | { who: 'none' };

export function turnAt(def: BoardDefinition, position: Position): Turn {
  if (isClosed(position)) return { who: 'none' };
  const step = stepById(def, position.step);
  if (!step) return { who: 'none' };
  const who = position.phase === 'doing' ? step.doer : step.reviewer;
  if (who === 'you') return { who: 'you' };
  if (who === 'any') return { who: 'agent' };
  return { who: 'none' };
}

// Whether the agent may take the step's work: any agent for an any-agent step, none for yours.
export function mayTake(def: BoardDefinition, stepId: string): boolean {
  return stepById(def, stepId)?.doer === 'any';
}

// Whether the performer may review the step where the item stands: the person always; an agent
// only on a step any agent reviews, and never a step it did in that round (`did`: the agents that
// did it), so another agent reviews it.
export function mayReview(
  def: BoardDefinition,
  position: Position,
  by: Performer,
  did: readonly string[] = [],
): boolean {
  if (isClosed(position) || position.phase === 'doing') return false;
  if (by.kind === 'human') return true;
  return stepById(def, position.step)?.reviewer === 'any' && !did.includes(by.name);
}

// Another item an item waits for: one of its parts, or one that blocks it. `board` and `step` are
// names as people read them (`step`: where it stands while open).
export type Linked = { id: string; board: string; step?: string; closed: boolean };

// What the engine reads of an item to check a handoff: its field values by part id, its evidence
// by part (the evidence module id it was attached to) and when, and when the step's current round
// began (a fresh part counts only from then on). `note` is the note the handoff carries; `parts`
// and `blockers` are what its waits read (none when left out). `sentBack`: a send-back started the
// step's current round, so its handoff carries a note, whatever the step asks. `unanswered`: the
// notes the person left in the round (core/board/notes.ts) the agent has not answered yet.
export type ItemFacts = {
  fields: Readonly<Record<string, unknown>>;
  evidence: readonly { part: string; at: string }[];
  roundStartedAt?: string;
  note?: string;
  sentBack?: boolean;
  parts?: readonly Linked[];
  blockers?: readonly Linked[];
  unanswered?: readonly number[];
  // The agents that did the step in its current round, none of which may review it.
  did?: readonly string[];
};

// The refs of what a handoff lacks besides parts: the note, the person's notes left unanswered, and
// each wait.
export const NOTE_REF = 'note';
export const NOTES_REF = 'notes';
export const WAIT_PARTS = 'wait:parts';
export const WAIT_BLOCKERS = 'wait:blockers';

// `missing`: nothing there; `not_new`: there, but from an earlier round; `unchecked`: a checklist
// with boxes still open; `open`: a wait whose items are not finished (`open`, of `total`). The note
// carries its `hint` ("Qué va aquí"), and `sentBack` when it is wanted because the round was sent
// back. The person's unanswered notes carry their numbers (`notes`).
export type Missing = {
  ref: string;
  name: string;
  reason: 'missing' | 'not_new' | 'unchecked' | 'open';
  fresh: boolean;
  hint?: string;
  sentBack?: boolean;
  open?: Linked[];
  total?: number;
  notes?: number[];
};

export type HandoffCheck = { ok: boolean; missing: Missing[] };

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Not JSON: one value, or several joined by commas.
  }
  return value
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function hasValue(part: Part, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (CHOICE_KINDS.includes(part.kind as never)) return asList(value).length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

// Whether a "required only when…" holds: the part it reads carries the value (one of them, for a
// multi). A yes-or-no reads `yes` and `no`.
export function whenHolds(def: BoardDefinition, facts: ItemFacts, part: string, value: string) {
  const read = partOf(def, part);
  const given = facts.fields[part];
  if (!read || given === undefined || given === null) return false;
  if (read.kind === 'yesno') {
    const yes = given === true || given === 'yes' || given === 'true';
    return value === 'yes' ? yes : !yes;
  }
  if (read.kind === 'multi') return asList(given).includes(value);
  return String(given) === value;
}

type MissingPart = { ref: string; part: Part; reason: Missing['reason']; fresh: boolean };

function missingOf(def: BoardDefinition, step: Step, facts: ItemFacts): MissingPart[] {
  return step.hand.flatMap((hand): MissingPart[] => {
    const part = partOf(def, hand.ref);
    if (!part || hand.req === 'no') return [];
    if (hand.req === 'when') {
      if (!hand.when || !whenHolds(def, facts, hand.when.part, hand.when.value)) return [];
    }
    const fresh = hand.fresh && isEvidence(part);
    if (isEvidence(part)) {
      const attached = facts.evidence.filter((entry) => entry.part === part.id);
      if (attached.length === 0) return [{ ref: part.id, part, reason: 'missing', fresh }];
      const since = facts.roundStartedAt;
      if (fresh && since !== undefined && !attached.some((entry) => entry.at >= since))
        return [{ ref: part.id, part, reason: 'not_new', fresh }];
      return [];
    }
    const value = part.id === TITLE ? facts.fields.title : facts.fields[part.id];
    if (!hasValue(part, value)) return [{ ref: part.id, part, reason: 'missing', fresh }];
    if (part.kind === 'check') {
      const ticked = new Set(asList(value));
      if (part.options.some(({ id }) => !ticked.has(id)))
        return [{ ref: part.id, part, reason: 'unchecked', fresh }];
    }
    return [];
  });
}

// The waits of a step that still hold the item: its open parts, then what open blocks it.
export function openWaits(step: Step, facts: ItemFacts): Missing[] {
  const out: Missing[] = [];
  if (step.waits.includes('parts')) {
    const parts = facts.parts ?? [];
    const open = parts.filter(({ closed }) => !closed);
    if (open.length > 0)
      out.push({
        ref: WAIT_PARTS,
        name: open[0]?.board ?? '',
        reason: 'open',
        fresh: false,
        open,
        total: parts.length,
      });
  }
  if (step.waits.includes('blockers')) {
    const open = (facts.blockers ?? []).filter(({ closed }) => !closed);
    if (open.length > 0)
      out.push({ ref: WAIT_BLOCKERS, name: '', reason: 'open', fresh: false, open });
  }
  return out;
}

// How many of the step's required handoff deliverables are in (`done`), of how many it asks for
// now (`of`): its parts required always, and those required when a value holds that does. The
// handoff note is not one: it is written at the handoff.
export function deliverables(
  def: BoardDefinition,
  stepId: string,
  facts: ItemFacts,
): { done: number; of: number } {
  const step = stepById(def, stepId);
  if (!step) return { done: 0, of: 0 };
  const of = step.hand.filter((hand) => {
    if (!partOf(def, hand.ref) || hand.req === 'no') return false;
    if (hand.req !== 'when') return true;
    return hand.when !== undefined && whenHolds(def, facts, hand.when.part, hand.when.value);
  }).length;
  return { done: of - missingOf(def, step, facts).length, of };
}

// What the step's handoff still lacks: the parts in the order the step lists them, then the note,
// then the person's notes still unanswered, then what it waits for.
export function handoffCheck(def: BoardDefinition, stepId: string, facts: ItemFacts): HandoffCheck {
  const step = stepById(def, stepId);
  if (!step) return { ok: false, missing: [] };
  const missing: Missing[] = missingOf(def, step, facts).map(({ ref, part, reason, fresh }) => ({
    ref,
    name: part.name,
    reason,
    fresh,
  }));
  const sentBack = step.note.req !== 'always' && facts.sentBack === true;
  if ((step.note.req === 'always' || sentBack) && !facts.note?.trim())
    missing.push({
      ref: NOTE_REF,
      name: NOTE_REF,
      reason: 'missing',
      fresh: true,
      hint: step.note.hint,
      ...(sentBack ? { sentBack } : {}),
    });
  if (facts.unanswered && facts.unanswered.length > 0)
    missing.push({
      ref: NOTES_REF,
      name: NOTES_REF,
      reason: 'missing',
      fresh: false,
      notes: [...facts.unanswered],
    });
  missing.push(...openWaits(step, facts));
  return { ok: missing.length === 0, missing };
}

// How a refused handoff is answered: missing parts or the note lead (missing_fields); otherwise
// the open parts (children_open), else what blocks it (blockers_open).
export function refusalCode(
  missing: readonly Missing[],
): 'missing_fields' | 'children_open' | 'blockers_open' {
  if (missing.some(({ reason }) => reason !== 'open')) return 'missing_fields';
  return missing.some(({ ref }) => ref === WAIT_PARTS) ? 'children_open' : 'blockers_open';
}

export type Performer = { kind: 'agent' | 'human'; name: string };

export type MoveRefusal =
  | { ok: false; code: 'missing'; missing: Missing[] }
  | {
      ok: false;
      code:
        | 'not_doing'
        | 'not_review'
        | 'not_yours'
        | 'bad_way'
        | 'unknown_step'
        | 'reason_required'
        | 'own_work';
    };

// `back`: the doer took the item back to an earlier step, for that step's next round.
export type MoveResult = { ok: true; to: Position; back?: true } | MoveRefusal;

function mayDo(step: Step, by: Performer): boolean {
  return step.doer === 'any' || by.kind === 'human';
}

// A handoff from the doing phase: refused while something required is missing; otherwise to the
// review, or, with no reviewer, along the way picked (the default when none is). A way back to an earlier step needs a reason and nothing else: giving up
// has nothing to hand, and nobody reviews it.
export function handoff(
  def: BoardDefinition,
  position: Position,
  facts: ItemFacts,
  options: { by: Performer; way?: Target; reason?: string },
): MoveResult {
  if (isClosed(position) || position.phase !== 'doing') return { ok: false, code: 'not_doing' };
  const step = stepById(def, position.step);
  if (!step) return { ok: false, code: 'unknown_step' };
  if (!mayDo(step, options.by)) return { ok: false, code: 'not_yours' };
  if (options.way !== undefined && backWaysOf(def, step.id).includes(options.way)) {
    if (!options.reason?.trim()) return { ok: false, code: 'reason_required' };
    return { ok: true, to: { step: options.way, phase: 'doing' }, back: true };
  }
  const ways = waysOf(def, step.id);
  if (options.way !== undefined && !ways.includes(options.way))
    return { ok: false, code: 'bad_way' };
  const check = handoffCheck(def, step.id, facts);
  if (!check.ok) return { ok: false, code: 'missing', missing: check.missing };
  if (step.reviewer === 'none') return { ok: true, to: positionAt(options.way ?? ways[0] ?? DONE) };
  return { ok: true, to: { step: step.id, phase: 'review' } };
}

// Whether the agent reviewing did the round itself: nobody reviews their own work.
function ownWork(by: Performer | undefined, did: readonly string[] = []): boolean {
  return by?.kind === 'agent' && did.includes(by.name);
}

// An approval from a review: along the way picked, or the default. With the item's facts, what the
// step waits for is checked again: a part reopened during the review stops the approval. `by`: who
// approves; an agent that did the round (facts.did) is refused.
export function approve(
  def: BoardDefinition,
  position: Position,
  way?: Target,
  facts?: ItemFacts,
  by?: Performer,
): MoveResult {
  if (isClosed(position) || position.phase === 'doing') return { ok: false, code: 'not_review' };
  if (ownWork(by, facts?.did)) return { ok: false, code: 'own_work' };
  const ways = waysOf(def, position.step);
  if (ways.length === 0) return { ok: false, code: 'unknown_step' };
  if (way !== undefined && !ways.includes(way)) return { ok: false, code: 'bad_way' };
  const step = stepById(def, position.step);
  const waits = step && facts ? openWaits(step, facts) : [];
  if (waits.length > 0) return { ok: false, code: 'missing', missing: waits };
  return { ok: true, to: positionAt(way ?? ways[0] ?? DONE) };
}

// Where a send-back lands: the step's `back`, this step or an earlier one, as its next round.
export function backTarget(def: BoardDefinition, stepId: string): string {
  const step = stepById(def, stepId);
  if (!step || step.back === SAME) return stepId;
  const back = stepIndex(def, step.back);
  return back >= 0 && back <= stepIndex(def, stepId) ? step.back : stepId;
}

// A send-back (Devolver, or an agent reviewer's Pedir otra ronda) from a review; never by the agent
// that did the round.
export function sendBack(
  def: BoardDefinition,
  position: Position,
  options: { by?: Performer; did?: readonly string[] } = {},
): MoveResult {
  if (isClosed(position) || position.phase === 'doing') return { ok: false, code: 'not_review' };
  if (ownWork(options.by, options.did)) return { ok: false, code: 'own_work' };
  if (!stepById(def, position.step)) return { ok: false, code: 'unknown_step' };
  return { ok: true, to: { step: backTarget(def, position.step), phase: 'doing' } };
}

// Where a new item starts: the first step, or the step after it when the first is skipped for an
// item created with everything its Entrega asks for (only a first step nobody reviews). Only at
// creation: a send-back into that step never skips it.
export function initialPosition(
  def: BoardDefinition,
  facts: ItemFacts,
): { position: Position; skipped: boolean } {
  const first = def.steps[0];
  if (!first) return { position: { closed: DONE }, skipped: false };
  const start: Position = { step: first.id, phase: 'doing' };
  if (!first.skipWhenReady || first.reviewer !== 'none') return { position: start, skipped: false };
  if (missingOf(def, first, facts).length > 0) return { position: start, skipped: false };
  return { position: positionAt(defaultWay(def, first.id)), skipped: true };
}

// Who asks for a discard: the person on the item's page, the person through an agent (a relay), or
// an agent on its own, doing a step that lets it.
export type DropVia = 'page' | 'relay' | 'agent';

export type DropResult =
  | { ok: true; to: Position }
  | {
      ok: false;
      code: 'not_open' | 'reason_required' | 'motive_required' | 'not_droppable' | 'not_relayable';
    };

// A discard (Descartar): always with a reason, and with one of the board's motives when it has any.
// An agent drops only while doing a step that lets its doer drop; a relay only on a board where the
// person may discard through an agent.
export function drop(
  def: BoardDefinition,
  position: Position,
  options: { by: Performer; via: DropVia; reason?: string; motive?: string },
): DropResult {
  if (isClosed(position)) return { ok: false, code: 'not_open' };
  if (options.via === 'agent') {
    const step = stepById(def, position.step);
    const may =
      step !== undefined &&
      step.doerMayDrop &&
      step.doer !== 'you' &&
      position.phase === 'doing' &&
      mayDo(step, { kind: 'agent', name: options.by.name });
    if (!may) return { ok: false, code: 'not_droppable' };
  }
  if (options.via === 'relay' && def.drop.by === 'page')
    return { ok: false, code: 'not_relayable' };
  if (!options.reason?.trim()) return { ok: false, code: 'reason_required' };
  if (def.drop.motives.length === 0) return { ok: true, to: { closed: DROPPED } };
  if (!options.motive || !motiveById(def, options.motive))
    return { ok: false, code: 'motive_required' };
  return { ok: true, to: { closed: DROPPED, motive: options.motive } };
}

export type GateAction = 'push' | 'merge';

// Why a gate answers as it does: `doing` (a push step being done), `review` (frozen while it is
// reviewed), `not_push_step`, `closed`, `done` (merge at Hecho), `not_done`, or `unguarded` (the
// board protects no branch, so it gates nothing).
export type GateAnswer = {
  allowed: boolean;
  why: 'doing' | 'review' | 'not_push_step' | 'closed' | 'done' | 'not_done' | 'unguarded';
};

// Whether the item's protected branch may take the action where the item stands: a push only while
// one of the guard's steps is being done (never during its review), a merge only once it is Hecho.
export function gateAt(def: BoardDefinition, position: Position, action: GateAction): GateAnswer {
  const branch = guardedBranch(def);
  if (!branch) return { allowed: true, why: 'unguarded' };
  if (action === 'merge') {
    const done = isClosed(position) && position.closed === DONE;
    return done ? { allowed: true, why: 'done' } : { allowed: false, why: 'not_done' };
  }
  if (isClosed(position)) return { allowed: false, why: 'closed' };
  if (!branch.guard.push.includes(position.step)) return { allowed: false, why: 'not_push_step' };
  if (position.phase !== 'doing') return { allowed: false, why: 'review' };
  return { allowed: true, why: 'doing' };
}

// `quiet`: a move the board made itself (a publish or a restore placing the item), not one of the
// work: it starts no round of a step already entered, and is never a send-back.
export type Transition = { from: string; to: string; at: string; quiet?: boolean };

// A step's round counts every time the item entered it, never restarting; `startedAt` is when the
// current round of each step began, and `dips` are the send-backs, for the route to draw.
export type Rounds = {
  rounds: Record<string, number>;
  startedAt: Record<string, string>;
  dips: { from: string; to: string; at: string }[];
};

export function roundsOf(
  def: BoardDefinition,
  initial: string,
  createdAt: string,
  transitions: readonly Transition[],
): Rounds {
  const out: Rounds = { rounds: {}, startedAt: {}, dips: [] };
  const enter = (stepId: string, at: string) => {
    out.rounds[stepId] = (out.rounds[stepId] ?? 0) + 1;
    out.startedAt[stepId] = at;
  };
  const first = positionOf(initial);
  if (!isClosed(first)) enter(first.step, createdAt);
  for (const { from, to, at, quiet } of transitions) {
    const target = positionOf(to);
    if (isClosed(target) || target.phase !== 'doing') continue;
    if (quiet) {
      if (out.rounds[target.step] === undefined) enter(target.step, at);
      continue;
    }
    const source = positionOf(from);
    if (!isClosed(source) && source.step === target.step && source.phase === 'doing') continue;
    enter(target.step, at);
    // A send-back from a review (to this step or an earlier one), or the doer taking it back.
    if (!isClosed(source)) {
      const from = stepIndex(def, source.step);
      const to = stepIndex(def, target.step);
      if (source.phase !== 'doing' ? to <= from : to < from)
        out.dips.push({ from: source.step, to: target.step, at });
    }
  }
  return out;
}

// The move that started the step's current round when it was a send-back (from a review of this
// step or a later one), as its index in `transitions`; -1 when the round began any other way.
export function sentBackAt(
  def: BoardDefinition,
  transitions: readonly Transition[],
  stepId: string,
): number {
  for (let index = transitions.length - 1; index >= 0; index -= 1) {
    const move = transitions[index];
    if (!move || move.quiet) continue;
    const target = positionOf(move.to);
    if (isClosed(target) || target.phase !== 'doing' || target.step !== stepId) continue;
    const source = positionOf(move.from);
    if (isClosed(source)) return -1;
    if (source.step === stepId && source.phase === 'doing') continue;
    const review = source.phase !== 'doing';
    return review && stepIndex(def, stepId) <= stepIndex(def, source.step) ? index : -1;
  }
  return -1;
}

// What a step starts with: the title, the creation form and everything handed off before it, each
// once, with the step that handed it off.
export function startsWith(def: BoardDefinition, stepId: string): { ref: string; from?: string }[] {
  const out: { ref: string; from?: string }[] = [
    { ref: TITLE },
    ...def.form.map(({ ref }) => ({ ref })),
  ];
  const index = stepIndex(def, stepId);
  for (const step of def.steps.slice(0, Math.max(0, index))) {
    for (const { ref } of step.hand) {
      if (!out.some((entry) => entry.ref === ref)) out.push({ ref, from: step.id });
    }
  }
  return out.filter(({ ref }) => partOf(def, ref) !== undefined);
}
