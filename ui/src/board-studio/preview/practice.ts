import {
  approve,
  backWaysOf,
  drop,
  type GateAction,
  type GateAnswer,
  gateAt,
  handoff,
  handoffCheck,
  initialPosition,
  isClosed,
  type Linked,
  NOTE_REF,
  type Performer,
  type Phase,
  type Position,
  type Rounds,
  roundsOf,
  sendBack,
  stateOf,
  type Transition,
  turnAt,
  WAIT_BLOCKERS,
  WAIT_PARTS,
  waysOf,
} from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  clone,
  DONE,
  guardedBranch,
  isAgent,
  isEvidence,
  motiveById,
  partOf,
  type Requirement,
  SAME,
  stepById,
  type Target,
  TITLE,
} from '../../../../src/core/board/model.ts';
import { itemPrefix, sampleRaw, sampleTitle } from './samples.ts';

// Probar: practice items through a copy of the draft, over the same step engine agents meet.
// Nothing here reaches the server; the dialog draws the state and words its log. A board that
// "se divide en" another board practises with that board's copy too: the item on the parent
// board, and parts you create on the child board, which its waits read for real.

export type Actor = 'you' | 'agent';

export type PracticeLog =
  // `filled`: created with everything its first step asks for; `parent`: the practice item it is
  // part of.
  | {
      kind: 'created';
      id: string;
      step: string;
      again?: boolean;
      filled?: boolean;
      parent?: string;
    }
  // Otea placed it past a first step it already had everything for.
  | { kind: 'skipped'; id: string; step: string; first: string }
  // `by`: you or an agent; `who`: the agent's name, null for you or for any agent. `note`: the
  // required note was missing too.
  | { kind: 'refused'; by: Actor; who: string | null; missing: string[]; note?: boolean }
  // A handoff its waits refused: parts still open (`open` of `total`), or what blocks it.
  | { kind: 'waited'; wait: 'parts' | 'blockers'; open: Linked[]; total: number; label: string }
  // `quick`: a part moved from the practice's item list (with everything it asks for).
  | {
      kind: 'handed';
      by: Actor;
      who: string | null;
      step: string;
      round: number;
      note?: string;
      id?: string;
      quick?: boolean;
    }
  | { kind: 'approved'; by: Actor; who: string | null; step: string; to: Target; id?: string }
  | { kind: 'approvalRefused'; open: Linked[] }
  | { kind: 'sentBack'; step: string; note: string; to: string; round: number }
  | { kind: 'again'; who: string; step: string }
  // A way back: Devolver a… (you) or Regresar a… (an agent), always with a reason.
  | { kind: 'tookBack'; by: Actor; who: string | null; id: string; to: string; reason: string }
  | {
      kind: 'dropped';
      by: Actor;
      who: string | null;
      id: string;
      motive: string | null;
      reason: string;
    }
  | { kind: 'gate'; action: GateAction; allowed: boolean }
  // What the practice made happen outside the item: its parts finish, one reopens, its blocker ends.
  | {
      kind: 'simulated';
      what: 'parts' | 'reopen' | 'blocker';
      label: string;
      id?: string;
      step?: string;
    }
  | { kind: 'done'; id: string };

// What Otea answers the last action with, in plain words (never CLI flags).
export type PracticeSaid =
  | { kind: 'refused'; missing: string[]; note?: boolean }
  | { kind: 'waited'; wait: 'parts'; open: Linked[]; total: number; label: string; item: string }
  | { kind: 'waited'; wait: 'blockers'; open: Linked[] }
  | { kind: 'approvalRefused'; open: Linked[] }
  | { kind: 'note' }
  | { kind: 'back'; step: string; round: number; fresh: boolean; noted?: boolean }
  // A way back with no reason; `you`: Devolver (your step), else an agent's Regresar.
  | { kind: 'reason'; you: boolean }
  | { kind: 'tookBack'; you: boolean; step: string; round: number }
  | { kind: 'skipped'; step: string; first: string }
  | { kind: 'dropRefused'; why: 'motive' | 'reason'; agent: boolean; motives: string[] };

export type PracticeState = {
  def: BoardDefinition;
  id: string;
  title: string;
  position: Position;
  createdAt: string;
  // The step it was created at, when the first step skipped it ("Crear con todo rellenado").
  startedAt?: string;
  tick: number;
  transitions: Transition[];
  fields: Record<string, unknown>;
  evidence: { part: string; at: string }[];
  way: Target | null;
  log: PracticeLog[];
  said: PracticeSaid | null;
  // The note the next handoff carries (Nota de la entrega), and the last one handed in.
  note: string;
  lastNote: string;
  // Still at creation: "Crear con todo rellenado" can place it past a skippable first step.
  fresh: boolean;
  // The practice item it is part of (a pair's part).
  parent: string | null;
  // Its parts, when they are practice items (a pair's parent); null reads the sample parts, of
  // which `simParts` are still open.
  parts: Linked[] | null;
  simParts: number;
  // The sample item that blocks it is still open.
  simBlocker: boolean;
  // The last branch action tried ("Subir cambios" / "Fusionar") and its answer.
  gate: { action: GateAction; answer: GateAnswer } | null;
};

const BASE = Date.parse('2026-11-12T09:00:00.000Z');
const clock = (tick: number) => new Date(BASE + tick * 60_000).toISOString();

// The sample parts a single board waits for: three on the board it divides into, two still open
// (one at its last step, one at its first), as the previews show them.
export function sampleParts(def: BoardDefinition, child?: BoardDefinition): Linked[] {
  const on = child ?? def;
  const prefix = itemPrefix(on.item);
  const last = on.steps.at(-1)?.name ?? '—';
  const first = on.steps[0]?.name ?? '—';
  const board = child ? child.name : on.name;
  return [
    { id: `${prefix}-4`, board, step: last, closed: false },
    { id: `${prefix}-7`, board, step: first, closed: false },
    { id: `${prefix}-2`, board, closed: true },
  ];
}

// The name the waits give the parts: the child board's name, or "its parts" on a board that
// divides into its own items.
export function partsLabel(def: BoardDefinition, child?: BoardDefinition): string | null {
  if (!def.split) return null;
  return def.split.board === SAME ? null : (child?.name ?? null);
}

// The sample item that blocks a board's items: on that board, at its last step.
export function sampleBlocker(def: BoardDefinition, other?: BoardDefinition): Linked {
  const on = other ?? def;
  return {
    id: `${itemPrefix(on.item)}-9`,
    board: on.name,
    step: on.steps.at(-1)?.name ?? '—',
    closed: false,
  };
}

function created(
  def: BoardDefinition,
  options: { again?: boolean; n?: number; parent?: string | null; title?: string } = {},
): PracticeState | null {
  const first = def.steps[0];
  if (!first) return null;
  const id = `${itemPrefix(def.item)}-${options.n ?? 1}`;
  const title = options.title ?? sampleTitle(def);
  const fields: Record<string, unknown> = { [TITLE]: title };
  for (const { ref } of def.form) {
    const part = partOf(def, ref);
    if (part && !isEvidence(part)) fields[ref] = sampleRaw(part, part.name.length);
  }
  const parent = options.parent ?? null;
  return {
    def,
    id,
    title,
    position: { step: first.id, phase: 'doing' },
    createdAt: clock(0),
    tick: 1,
    transitions: [],
    fields,
    evidence: [],
    way: null,
    log: [
      {
        kind: 'created',
        id,
        step: first.name,
        ...(options.again ? { again: true } : {}),
        ...(parent ? { parent } : {}),
      },
    ],
    said: null,
    note: '',
    lastNote: '',
    fresh: true,
    parent,
    parts: null,
    simParts: 2,
    simBlocker: true,
    gate: null,
  };
}

export function startPractice(def: BoardDefinition): PracticeState | null {
  return created(clone(def));
}

export function restartPractice(state: PracticeState): PracticeState {
  return created(state.def, { again: true }) ?? state;
}

export type ChecklistRow = {
  ref: string;
  name: string;
  req: Requirement;
  fresh: boolean;
  evidence: boolean;
  ok: boolean;
};

// A wait's row: what is still open (`open` of `total`); `simulated` when the parts are samples.
export type WaitRow =
  | { wait: 'parts'; label: string | null; open: Linked[]; total: number; simulated: boolean }
  | { wait: 'blockers'; open: Linked[] };

export type PracticeView = {
  closed: boolean;
  step: string;
  phase: Phase;
  round: number;
  rounds: Rounds;
  dips: Rounds['dips'];
  ways: Target[];
  way: Target;
  // The earlier steps the doer may take it back to.
  backs: string[];
  checklist: ChecklistRow[];
  // The note row, when the step asks for one (`req` always: required).
  note: { req: 'no' | 'always'; hint: string } | null;
  waits: WaitRow[];
  // Who plays now: you, the step's agent, or its agent reviewer.
  actor: 'you' | 'agent' | 'reviewer';
  agent: string | null;
  // "Crear con todo rellenado" is on offer: the first step skips an item that has it all.
  canSkip: boolean;
  // Descartar plays the step's agent (it may drop), else you.
  dropsAs: 'you' | 'agent';
  // The board protects a branch: the practice tries Subir cambios and Fusionar.
  guarded: boolean;
};

const roundsNow = (s: PracticeState): Rounds =>
  roundsOf(
    s.def,
    stateOf({ step: s.startedAt ?? s.def.steps[0]?.id ?? '', phase: 'doing' }),
    s.createdAt,
    s.transitions,
  );

// The parts its waits read: the practice items, or the samples (the first `simParts` open).
export function partsOf(s: PracticeState, child?: BoardDefinition): Linked[] {
  if (s.parts) return s.parts;
  let open = s.simParts;
  return sampleParts(s.def, child).map((part) => {
    if (part.closed) return part;
    const still = open > 0;
    open -= 1;
    return still ? part : { id: part.id, board: part.board, closed: true };
  });
}

const blockersOf = (s: PracticeState): Linked[] => {
  const blocker = sampleBlocker(s.def);
  return [s.simBlocker ? blocker : { ...blocker, closed: true }];
};

const factsOf = (s: PracticeState, rounds: Rounds, step: string, child?: BoardDefinition) => ({
  fields: s.fields,
  evidence: s.evidence,
  ...(rounds.startedAt[step] ? { roundStartedAt: rounds.startedAt[step] } : {}),
  note: s.note,
  parts: partsOf(s, child),
  blockers: blockersOf(s),
});

const CLOSED_VIEW = {
  closed: true,
  step: DONE,
  phase: 'doing' as const,
  round: 1,
  ways: [],
  way: DONE,
  backs: [],
  checklist: [],
  note: null,
  waits: [],
  actor: 'you' as const,
  agent: null,
  canSkip: false,
  dropsAs: 'you' as const,
};

export function practiceView(s: PracticeState, child?: BoardDefinition): PracticeView {
  const rounds = roundsNow(s);
  const guarded = guardedBranch(s.def) !== undefined;
  if (isClosed(s.position)) return { ...CLOSED_VIEW, rounds, dips: rounds.dips, guarded };
  const { step: stepId, phase } = s.position;
  const step = stepById(s.def, stepId);
  const ways = waysOf(s.def, stepId);
  const way = s.way && ways.includes(s.way) ? s.way : (ways[0] ?? DONE);
  const facts = factsOf(s, rounds, stepId, child);
  const missing = new Set(handoffCheck(s.def, stepId, facts).missing.map(({ ref }) => ref));
  const checklist = (step?.hand ?? []).flatMap((hand): ChecklistRow[] => {
    const part = partOf(s.def, hand.ref);
    if (!part) return [];
    const evidence = isEvidence(part);
    const since = facts.roundStartedAt;
    const fresh = hand.fresh && evidence;
    const there = evidence
      ? s.evidence.some((e) => e.part === part.id && (!fresh || !since || e.at >= since))
      : s.fields[part.id] !== undefined;
    return [
      {
        ref: part.id,
        name: part.name,
        req: hand.req,
        fresh,
        evidence,
        ok: there && !missing.has(part.id),
      },
    ];
  });
  const waits: WaitRow[] = [];
  if (step?.waits.includes('parts')) {
    const parts = facts.parts;
    waits.push({
      wait: 'parts',
      label: partsLabel(s.def, child),
      open: parts.filter(({ closed }) => !closed),
      total: parts.length,
      simulated: s.parts === null,
    });
  }
  if (step?.waits.includes('blockers'))
    waits.push({ wait: 'blockers', open: facts.blockers.filter(({ closed }) => !closed) });
  const turn = turnAt(s.def, s.position);
  const actor =
    phase === 'doing'
      ? turn.who === 'you'
        ? 'you'
        : 'agent'
      : turn.who === 'you'
        ? 'you'
        : 'reviewer';
  const agent = turn.who === 'agent' ? (turn.agent ?? null) : null;
  const first = s.def.steps[0];
  const canSkip =
    s.fresh &&
    first !== undefined &&
    first.id === stepId &&
    first.skipWhenReady &&
    first.reviewer === 'none' &&
    s.def.steps.length > 1;
  const dropsAs =
    phase === 'doing' && step !== undefined && step.doer !== 'you' && step.doerMayDrop
      ? 'agent'
      : 'you';
  return {
    closed: false,
    step: stepId,
    phase,
    round: rounds.rounds[stepId] ?? 1,
    rounds,
    dips: rounds.dips,
    ways,
    way,
    backs: backWaysOf(s.def, stepId),
    checklist,
    note: step && (step.note.req === 'always' || step.note.hint.trim()) ? step.note : null,
    waits,
    actor,
    agent,
    canSkip,
    dropsAs,
    guarded,
  };
}

// Attach or fill one part of the step's handoff (a practice value: every box ticked).
export function fillPart(s: PracticeState, ref: string): PracticeState {
  const part = partOf(s.def, ref);
  if (!part) return s;
  const at = clock(s.tick);
  const next = { ...s, tick: s.tick + 1, said: null, fresh: false };
  if (isEvidence(part)) return { ...next, evidence: [...s.evidence, { part: ref, at }] };
  return { ...next, fields: { ...s.fields, [ref]: sampleRaw(part, part.name.length) } };
}

// Every part the step's handoff names, filled or attached, and the note when it asks for one.
function fillAll(s: PracticeState): PracticeState {
  if (isClosed(s.position)) return s;
  const step = stepById(s.def, s.position.step);
  let next = s;
  for (const { ref } of step?.hand ?? []) next = fillPart(next, ref);
  if (step?.note.req === 'always' && !next.note.trim())
    next = { ...next, note: step.note.hint.trim() || 'ok' };
  return next;
}

export function pickWay(s: PracticeState, way: Target): PracticeState {
  return { ...s, way, fresh: false };
}

// The Nota de la entrega the next handoff carries.
export function writeNote(s: PracticeState, note: string): PracticeState {
  return { ...s, note, fresh: false };
}

function moved(s: PracticeState, to: Position, log: PracticeLog[]): PracticeState {
  const at = clock(s.tick);
  const next: PracticeState = {
    ...s,
    tick: s.tick + 1,
    position: to,
    transitions: [...s.transitions, { from: stateOf(s.position), to: stateOf(to), at }],
    way: null,
    log: [...s.log, ...log],
    said: null,
    note: '',
    fresh: false,
    gate: null,
  };
  return isClosed(to) ? { ...next, log: [...next.log, { kind: 'done', id: s.id }] } : next;
}

const performer = (view: PracticeView): Performer =>
  view.actor === 'you'
    ? { kind: 'human', name: 'you' }
    : { kind: 'agent', name: view.agent ?? 'agent' };

const who = (view: PracticeView) => (view.actor === 'you' ? null : view.agent);

export function handOff(
  s: PracticeState,
  options: { child?: BoardDefinition; quick?: boolean } = {},
): PracticeState {
  if (isClosed(s.position) || s.position.phase !== 'doing') return s;
  const view = practiceView(s, options.child);
  const step = stepById(s.def, s.position.step);
  if (!step) return s;
  const result = handoff(s.def, s.position, factsOf(s, view.rounds, step.id, options.child), {
    by: performer(view),
    ...(step.reviewer === 'none' ? { way: view.way } : {}),
  });
  const base = { ...s, fresh: false };
  if (!result.ok) {
    if (result.code !== 'missing') return base;
    const parts = result.missing.filter(({ reason, ref }) => reason !== 'open' && ref !== NOTE_REF);
    const note = result.missing.some(({ ref }) => ref === NOTE_REF);
    if (parts.length > 0 || note) {
      const missing = parts.map(({ name }) => name);
      return {
        ...base,
        log: [
          ...s.log,
          {
            kind: 'refused',
            by: actorOf(view),
            who: who(view),
            missing,
            ...(note ? { note } : {}),
          },
        ],
        said: { kind: 'refused', missing, ...(note ? { note } : {}) },
      };
    }
    const partsWait = result.missing.find(({ ref }) => ref === WAIT_PARTS);
    const label = partsLabel(s.def, options.child) ?? '';
    if (partsWait) {
      const open = partsWait.open ?? [];
      const total = partsWait.total ?? open.length;
      return {
        ...base,
        log: [...s.log, { kind: 'waited', wait: 'parts', open, total, label }],
        said: {
          kind: 'waited',
          wait: 'parts',
          open,
          total,
          label,
          item: options.child?.item ?? s.def.item,
        },
      };
    }
    const blocking = result.missing.find(({ ref }) => ref === WAIT_BLOCKERS)?.open ?? [];
    return {
      ...base,
      log: [...s.log, { kind: 'waited', wait: 'blockers', open: blocking, total: 0, label }],
      said: { kind: 'waited', wait: 'blockers', open: blocking },
    };
  }
  const note = s.note.trim();
  const next = moved(s, result.to, [
    {
      kind: 'handed',
      by: actorOf(view),
      who: who(view),
      step: step.name,
      round: view.round,
      ...(note ? { note } : {}),
      ...(options.quick ? { id: s.id, quick: true } : {}),
    },
  ]);
  return { ...next, lastNote: note };
}

export function approvePractice(
  s: PracticeState,
  options: { child?: BoardDefinition; quick?: boolean } = {},
): PracticeState {
  if (isClosed(s.position) || s.position.phase === 'doing') return s;
  const view = practiceView(s, options.child);
  const step = stepById(s.def, s.position.step);
  if (!step) return s;
  const facts = factsOf(s, view.rounds, step.id, options.child);
  const result = approve(s.def, s.position, view.way, facts);
  if (!result.ok) {
    if (result.code !== 'missing') return s;
    const open = result.missing.flatMap(({ open: still }) => still ?? []);
    // A sample part that reopened finishes again at once: the refusal is what the practice shows.
    return {
      ...s,
      simParts: s.parts === null ? 0 : s.simParts,
      log: [...s.log, { kind: 'approvalRefused', open }],
      said: { kind: 'approvalRefused', open },
    };
  }
  return moved(s, result.to, [
    {
      kind: 'approved',
      by: actorOf(view),
      who: who(view),
      step: step.name,
      to: view.way,
      ...(options.quick ? { id: s.id } : {}),
    },
  ]);
}

// Devolver (yours, with a note) or an agent reviewer's Pedir otra ronda.
export function sendBackPractice(s: PracticeState, note: string): PracticeState {
  if (isClosed(s.position) || s.position.phase === 'doing') return s;
  const view = practiceView(s);
  const step = stepById(s.def, s.position.step);
  if (!step) return s;
  if (view.actor === 'you' && note.trim() === '') return { ...s, said: { kind: 'note' } };
  const result = sendBack(s.def, s.position);
  if (!result.ok || isClosed(result.to)) return s;
  const target = stepById(s.def, result.to.step);
  const log: PracticeLog =
    view.actor === 'you'
      ? {
          kind: 'sentBack',
          step: step.name,
          note: note.trim(),
          to: target?.name ?? '',
          round: (view.rounds.rounds[result.to.step] ?? 1) + 1,
        }
      : { kind: 'again', who: view.agent ?? '', step: step.name };
  const next = moved(s, result.to, [log]);
  const fresh = (target?.hand ?? []).some(({ fresh, ref }) => {
    const part = partOf(s.def, ref);
    return fresh && part !== undefined && isEvidence(part);
  });
  const round = practiceView(next).round;
  const noted = target !== undefined && target.note.req === 'always';
  return {
    ...next,
    said: { kind: 'back', step: target?.name ?? '', round, fresh, ...(noted ? { noted } : {}) },
  };
}

// A way back from the doing phase: Devolver a… on your step, Regresar a… by its agent. Always with
// a reason, never reviewed; the earlier step starts its next round.
export function takeBack(s: PracticeState, to: string, reason: string): PracticeState {
  if (isClosed(s.position) || s.position.phase !== 'doing') return s;
  const view = practiceView(s);
  const you = view.actor === 'you';
  const result = handoff(s.def, s.position, factsOf(s, view.rounds, s.position.step), {
    by: performer(view),
    way: to,
    reason,
  });
  if (!result.ok) {
    if (result.code === 'reason_required')
      return { ...s, fresh: false, said: { kind: 'reason', you } };
    return s;
  }
  const name = stepById(s.def, to)?.name ?? to;
  const next = moved(s, result.to, [
    {
      kind: 'tookBack',
      by: actorOf(view),
      who: who(view),
      id: s.id,
      to: name,
      reason: reason.trim(),
    },
  ]);
  const round = practiceView(next).round;
  return { ...next, said: { kind: 'tookBack', you, step: name, round } };
}

// "Crear con todo rellenado": the item is created with everything its first step asks for, so a
// first step that skips such items places it at the next one (initialPosition).
export function createFilled(s: PracticeState): PracticeState {
  const first = s.def.steps[0];
  if (!first || !practiceView(s).canSkip) return s;
  const filled = fillAll(s);
  const placed = initialPosition(s.def, { fields: filled.fields, evidence: filled.evidence });
  if (!placed.skipped || isClosed(placed.position)) return s;
  const step = stepById(s.def, placed.position.step);
  const log = s.log.slice(0, -1);
  return {
    ...filled,
    position: placed.position,
    startedAt: placed.position.step,
    note: '',
    fresh: false,
    said: { kind: 'skipped', step: step?.name ?? '', first: first.name },
    log: [
      ...log,
      {
        kind: 'created',
        id: s.id,
        step: first.name,
        filled: true,
        ...(s.parent ? { parent: s.parent } : {}),
      },
      { kind: 'skipped', id: s.id, step: step?.name ?? '', first: first.name },
    ],
  };
}

// Descartar: you on the page, or the step's agent when it may drop. Always with a reason, and one
// of the board's motives when it has any.
export function dropPractice(
  s: PracticeState,
  motive: string | null,
  reason: string,
): PracticeState {
  if (isClosed(s.position)) return s;
  const view = practiceView(s);
  const agent = view.dropsAs === 'agent';
  const motives = s.def.drop.motives.map(({ name }) => name);
  const refuse = (why: 'motive' | 'reason'): PracticeState => ({
    ...s,
    fresh: false,
    said: { kind: 'dropRefused', why, agent, motives },
  });
  if (motives.length > 0 && !(motive && motiveById(s.def, motive))) return refuse('motive');
  const by: Performer = agent
    ? { kind: 'agent', name: view.agent ?? 'agent' }
    : { kind: 'human', name: 'you' };
  const result = drop(s.def, s.position, {
    by,
    via: agent ? 'agent' : 'page',
    reason,
    ...(motive ? { motive } : {}),
  });
  if (!result.ok) return result.code === 'reason_required' ? refuse('reason') : refuse('motive');
  const name = motive ? (motiveById(s.def, motive)?.name ?? null) : null;
  const next = moved(s, result.to, [
    {
      kind: 'dropped',
      by: agent ? 'agent' : 'you',
      who: agent ? view.agent : null,
      id: s.id,
      motive: name,
      reason: reason.trim(),
    },
  ]);
  // A discard ends it without passing Hecho.
  return { ...next, log: next.log.filter((entry) => entry.kind !== 'done') };
}

// Subir cambios / Fusionar on the protected branch, answered where the item stands.
export function tryGate(s: PracticeState, action: GateAction): PracticeState {
  const answer = gateAt(s.def, s.position, action);
  return {
    ...s,
    gate: { action, answer },
    log: [...s.log, { kind: 'gate', action, allowed: answer.allowed }],
  };
}

// The sample parts or the sample blocker of a single board, as the practice simulates them.
export function simulate(
  s: PracticeState,
  what: 'parts' | 'reopen' | 'blocker',
  child?: BoardDefinition,
): PracticeState {
  const label = partsLabel(s.def, child) ?? '';
  if (what === 'blocker') {
    const blocker = sampleBlocker(s.def);
    return {
      ...s,
      simBlocker: false,
      said: null,
      log: [...s.log, { kind: 'simulated', what, label, id: blocker.id }],
    };
  }
  if (what === 'parts')
    return { ...s, simParts: 0, said: null, log: [...s.log, { kind: 'simulated', what, label }] };
  const part = sampleParts(s.def, child)[0];
  return {
    ...s,
    simParts: 1,
    said: null,
    log: [
      ...s.log,
      { kind: 'simulated', what, label, ...(part ? { id: part.id, step: part.step ?? '' } : {}) },
    ],
  };
}

export const reviewerIsAgent = (def: BoardDefinition, stepId: string): boolean => {
  const step = stepById(def, stepId);
  return step !== undefined && isAgent(step.reviewer);
};

const actorOf = (view: PracticeView): Actor => (view.actor === 'you' ? 'you' : 'agent');

// ─── a pair: the parent's item and the parts created on the child board ───

export type PracticeRun = {
  // The parent's item first (or the single board's), then its parts in creation order.
  items: PracticeState[];
  focus: number;
  // The pair's child board, as copied for the practice; null on a single board.
  child: BoardDefinition | null;
  // Every item's log, in the order things happened.
  log: { id: string; entry: PracticeLog }[];
};

const logged = (state: PracticeState) => state.log.map((entry) => ({ id: state.id, entry }));

// A practice run: on a pair, `onChild` starts it from the child's tab, with one part already
// created on the parent's item.
export function startRun(
  def: BoardDefinition,
  child: BoardDefinition | null = null,
  onChild = false,
): PracticeRun | null {
  const first = startPractice(def);
  if (!first) return null;
  if (child && child.steps.length === 0) return null;
  const run: PracticeRun = {
    items: [first],
    focus: 0,
    child: child ? clone(child) : null,
    log: logged(first),
  };
  return child && onChild ? { ...addPart(run), focus: 1 } : run;
}

export function restartRun(run: PracticeRun, onChild = false): PracticeRun {
  const first = run.items[0];
  if (!first) return run;
  const again = restartPractice(first);
  const fresh: PracticeRun = { ...run, items: [again], focus: 0, log: logged(again) };
  return run.child && onChild ? { ...addPart(fresh), focus: 1 } : fresh;
}

// The parts of the parent's item, as its waits read them.
function linkedParts(run: PracticeRun): Linked[] | null {
  const child = run.child;
  if (!child) return null;
  return run.items.slice(1).map((item) => {
    const step = isClosed(item.position) ? undefined : stepById(child, item.position.step)?.name;
    return {
      id: item.id,
      board: child.name,
      ...(step ? { step } : {}),
      closed: isClosed(item.position),
    };
  });
}

// The item at `k`, with what its waits read filled in.
export function itemAt(run: PracticeRun, k = run.focus): PracticeState | undefined {
  const item = run.items[k];
  if (!item || k !== 0 || !run.child) return item;
  return { ...item, parts: linkedParts(run) };
}

// The child board for the item at `k`'s waits: the parent's item reads the pair's child board.
export const childFor = (run: PracticeRun, k = run.focus): BoardDefinition | undefined =>
  k === 0 && run.child ? run.child : undefined;

// Acts on the item at `k` (the focused one by default), keeping the run's log in order.
export function act(
  run: PracticeRun,
  change: (state: PracticeState, child: BoardDefinition | undefined) => PracticeState,
  k = run.focus,
): PracticeRun {
  const before = itemAt(run, k);
  if (!before) return run;
  const after = change(before, childFor(run, k));
  // Entries are kept by identity: one the change dropped ("Crear con todo rellenado" rewrites the
  // creation line) leaves the run's log too; new ones follow, in order.
  const kept = new Set(after.log);
  const known = new Set(run.log.map(({ entry }) => entry));
  const log = [
    ...run.log.filter(({ id, entry }) => id !== before.id || kept.has(entry)),
    ...after.log.filter((entry) => !known.has(entry)).map((entry) => ({ id: after.id, entry })),
  ];
  // A part that moves makes the parent's refusal about its parts or their reopening stale.
  const stale = (said: PracticeSaid | null | undefined) =>
    said?.kind === 'waited' || said?.kind === 'approvalRefused';
  const moved = k !== 0 && JSON.stringify(after.position) !== JSON.stringify(before.position);
  const items = run.items.map((item, i) => {
    if (i === k) return { ...after, parts: item.parts };
    if (i === 0 && moved && stale(item.said)) return { ...item, said: null };
    return item;
  });
  return { ...run, items, log };
}

// "+ Crear · Tarea de repo, parte de CAM-1".
export function addPart(run: PracticeRun): PracticeRun {
  const parent = run.items[0];
  if (!run.child || !parent) return run;
  const n = run.items.length;
  const part = created(run.child, {
    n,
    parent: parent.id,
    title: sampleTitle(run.child, n - 1),
  });
  if (!part) return run;
  return { ...run, items: [...run.items, part], log: [...run.log, ...logged(part)] };
}

export const focusOn = (run: PracticeRun, k: number): PracticeRun =>
  run.items[k] ? { ...run, focus: k } : run;

// A part's quick action from the item list: it hands off with everything it asks for, or it is
// approved, without opening it.
export function quickStep(run: PracticeRun, k: number): PracticeRun {
  const item = run.items[k];
  if (!item || k === 0 || isClosed(item.position)) return run;
  if (item.position.phase === 'doing')
    return act(run, (state) => handOff(fillAll(state), { quick: true }), k);
  return act(run, (state) => approvePractice(state, { quick: true }), k);
}

// The quick action's words, for the item list: who moves it now.
export function quickAction(
  item: PracticeState,
): { kind: 'handOff' | 'approve'; agent: string | null; you: boolean } | null {
  if (isClosed(item.position)) return null;
  const turn = turnAt(item.def, item.position);
  const you = turn.who === 'you';
  const agent = turn.who === 'agent' ? (turn.agent ?? null) : null;
  return { kind: item.position.phase === 'doing' ? 'handOff' : 'approve', agent, you };
}

// "Simular: se reabre RT-1": a finished part opens again at its last step.
export function reopenPart(run: PracticeRun, k: number): PracticeRun {
  const item = run.items[k];
  const last = item?.def.steps.at(-1);
  if (!item || !last || k === 0 || !isClosed(item.position)) return run;
  const reopened: PracticeState = {
    ...item,
    position: { step: last.id, phase: 'doing' },
    log: [
      ...item.log,
      { kind: 'simulated', what: 'reopen', label: '', id: item.id, step: last.name },
    ],
  };
  return act(run, () => reopened, k);
}

// How a run stands for the parent's closing words: its parts, and how many finished.
export function runParts(run: PracticeRun): { total: number; done: number } {
  const parts = run.items.slice(1);
  return { total: parts.length, done: parts.filter(({ position }) => isClosed(position)).length };
}
