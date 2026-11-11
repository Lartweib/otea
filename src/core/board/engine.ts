import {
  type BoardDefinition,
  CHOICE_KINDS,
  DONE,
  DROPPED,
  defaultWay,
  isAgent,
  isEvidence,
  type Part,
  partOf,
  type Reviewer,
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

// The phases of a step: `doing` (the doer's), `review` (the reviewer's) and `yours`, the review
// that falls to you when the step's agent reviewer did the work itself.
export type Phase = 'doing' | 'review' | 'yours';

export type Closed = typeof DONE | typeof DROPPED;

export type Position = { step: string; phase: Phase } | { closed: Closed };

const SUFFIX: Readonly<Record<Phase, string>> = { doing: '', review: '__review', yours: '__yours' };

// The workflow state a position compiles to: the step id while doing, `<id>__review` and
// `<id>__yours` for the reviews, and `done` and `dropped` when closed.
export function stateOf(position: Position): string {
  if ('closed' in position) return position.closed;
  return position.step + SUFFIX[position.phase];
}

export function positionOf(state: string): Position {
  if (state === DONE || state === DROPPED) return { closed: state };
  for (const phase of ['review', 'yours'] as const) {
    if (state.endsWith(SUFFIX[phase]))
      return { step: state.slice(0, -SUFFIX[phase].length), phase };
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

// Who reviews the step's work: its reviewer, except that nobody reviews their own work, so an
// agent reviewer's review of what it did itself falls to you.
export function reviewerFor(def: BoardDefinition, stepId: string, doneBy?: string): Reviewer {
  const reviewer = stepById(def, stepId)?.reviewer ?? 'none';
  if (isAgent(reviewer) && doneBy !== undefined && reviewer.agent === doneBy) return 'you';
  return reviewer;
}

export type Turn = { who: 'you' } | { who: 'agent'; agent?: string } | { who: 'none' };

export function turnAt(def: BoardDefinition, position: Position): Turn {
  if (isClosed(position)) return { who: 'none' };
  const step = stepById(def, position.step);
  if (!step) return { who: 'none' };
  if (position.phase === 'yours') return { who: 'you' };
  const who = position.phase === 'doing' ? step.doer : step.reviewer;
  if (who === 'you') return { who: 'you' };
  if (who === 'any') return { who: 'agent' };
  if (who === 'none') return { who: 'none' };
  return { who: 'agent', agent: who.agent };
}

// Whether the agent may take the step's work: any agent for an any-agent step, the named one for a
// named step, none for yours.
export function mayTake(def: BoardDefinition, stepId: string, agent: string): boolean {
  const doer = stepById(def, stepId)?.doer;
  if (doer === 'any') return true;
  return doer !== undefined && isAgent(doer) && doer.agent === agent;
}

// What the engine reads of an item to check a handoff: its field values by part id, its evidence
// by part (the evidence module id it was attached to) and when, and when the step's current round
// began (a fresh part counts only from then on).
export type ItemFacts = {
  fields: Readonly<Record<string, unknown>>;
  evidence: readonly { part: string; at: string }[];
  roundStartedAt?: string;
};

// `missing`: nothing there; `not_new`: there, but from an earlier round; `unchecked`: a checklist
// with boxes still open.
export type Missing = {
  ref: string;
  name: string;
  reason: 'missing' | 'not_new' | 'unchecked';
  fresh: boolean;
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

// What the step's handoff still lacks, in the order the step lists it.
export function handoffCheck(def: BoardDefinition, stepId: string, facts: ItemFacts): HandoffCheck {
  const step = stepById(def, stepId);
  if (!step) return { ok: false, missing: [] };
  const missing = missingOf(def, step, facts).map(({ ref, part, reason, fresh }) => ({
    ref,
    name: part.name,
    reason,
    fresh,
  }));
  return { ok: missing.length === 0, missing };
}

export type Performer = { kind: 'agent' | 'human'; name: string };

export type MoveRefusal =
  | { ok: false; code: 'missing'; missing: Missing[] }
  | { ok: false; code: 'not_doing' | 'not_review' | 'not_yours' | 'bad_way' | 'unknown_step' };

export type MoveResult = { ok: true; to: Position } | MoveRefusal;

function mayDo(step: Step, by: Performer): boolean {
  if (step.doer === 'you') return by.kind === 'human';
  if (step.doer === 'any') return true;
  return by.kind === 'human' || by.name === step.doer.agent;
}

// A handoff from the doing phase: refused while something required is missing; otherwise to the
// review (yours when the reviewer did the work), or, with no reviewer, along the way picked (the
// default when none is).
export function handoff(
  def: BoardDefinition,
  position: Position,
  facts: ItemFacts,
  options: { by: Performer; way?: Target },
): MoveResult {
  if (isClosed(position) || position.phase !== 'doing') return { ok: false, code: 'not_doing' };
  const step = stepById(def, position.step);
  if (!step) return { ok: false, code: 'unknown_step' };
  if (!mayDo(step, options.by)) return { ok: false, code: 'not_yours' };
  const ways = waysOf(def, step.id);
  if (options.way !== undefined && !ways.includes(options.way))
    return { ok: false, code: 'bad_way' };
  const check = handoffCheck(def, step.id, facts);
  if (!check.ok) return { ok: false, code: 'missing', missing: check.missing };
  const reviewer = reviewerFor(
    def,
    step.id,
    options.by.kind === 'agent' ? options.by.name : undefined,
  );
  if (reviewer === 'none') return { ok: true, to: positionAt(options.way ?? ways[0] ?? DONE) };
  const phase = reviewer === 'you' && isAgent(step.reviewer) ? 'yours' : 'review';
  return { ok: true, to: { step: step.id, phase } };
}

// An approval from a review: along the way picked, or the default.
export function approve(def: BoardDefinition, position: Position, way?: Target): MoveResult {
  if (isClosed(position) || position.phase === 'doing') return { ok: false, code: 'not_review' };
  const ways = waysOf(def, position.step);
  if (ways.length === 0) return { ok: false, code: 'unknown_step' };
  if (way !== undefined && !ways.includes(way)) return { ok: false, code: 'bad_way' };
  return { ok: true, to: positionAt(way ?? ways[0] ?? DONE) };
}

// Where a send-back lands: the step's `back`, this step or an earlier one, as its next round.
export function backTarget(def: BoardDefinition, stepId: string): string {
  const step = stepById(def, stepId);
  if (!step || step.back === SAME) return stepId;
  const back = stepIndex(def, step.back);
  return back >= 0 && back <= stepIndex(def, stepId) ? step.back : stepId;
}

// A send-back (Devolver, or an agent reviewer's Pedir otra ronda) from a review.
export function sendBack(def: BoardDefinition, position: Position): MoveResult {
  if (isClosed(position) || position.phase === 'doing') return { ok: false, code: 'not_review' };
  if (!stepById(def, position.step)) return { ok: false, code: 'unknown_step' };
  return { ok: true, to: { step: backTarget(def, position.step), phase: 'doing' } };
}

export type Transition = { from: string; to: string; at: string };

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
  for (const { from, to, at } of transitions) {
    const target = positionOf(to);
    if (isClosed(target) || target.phase !== 'doing') continue;
    const source = positionOf(from);
    if (!isClosed(source) && source.step === target.step && source.phase === 'doing') continue;
    enter(target.step, at);
    if (!isClosed(source) && source.phase !== 'doing') {
      if (stepIndex(def, target.step) <= stepIndex(def, source.step))
        out.dips.push({ from: source.step, to: target.step, at });
    }
  }
  return out;
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
