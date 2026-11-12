import {
  approve,
  handoff,
  handoffCheck,
  isClosed,
  type Performer,
  type Phase,
  type Position,
  type Rounds,
  roundsOf,
  sendBack,
  stateOf,
  type Transition,
  turnAt,
  waysOf,
} from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  clone,
  DONE,
  isAgent,
  isEvidence,
  partOf,
  type Requirement,
  stepById,
  type Target,
  TITLE,
} from '../../../../src/core/board/model.ts';
import { itemPrefix, sampleRaw, sampleTitle } from './samples.ts';

// Probar: one practice item through a copy of the draft, over the same step engine agents meet.
// Nothing here reaches the server; the dialog draws the state and words its log.

export type PracticeLog =
  | { kind: 'created'; id: string; step: string; again?: boolean }
  // `by`: you or an agent; `who`: the agent's name, null for you or for any agent.
  | { kind: 'refused'; by: Actor; who: string | null; missing: string[] }
  | { kind: 'handed'; by: Actor; who: string | null; step: string; round: number }
  | { kind: 'approved'; by: Actor; who: string | null; step: string; to: Target }
  | { kind: 'sentBack'; step: string; note: string; to: string; round: number }
  | { kind: 'again'; who: string; step: string }
  | { kind: 'done'; id: string };

export type Actor = 'you' | 'agent';

export type PracticeSaid =
  | { kind: 'refused'; missing: string[] }
  | { kind: 'note' }
  | { kind: 'back'; step: string; round: number; fresh: boolean };

export type PracticeState = {
  def: BoardDefinition;
  id: string;
  title: string;
  position: Position;
  createdAt: string;
  tick: number;
  transitions: Transition[];
  fields: Record<string, unknown>;
  evidence: { part: string; at: string }[];
  way: Target | null;
  log: PracticeLog[];
  said: PracticeSaid | null;
};

const BASE = Date.parse('2026-11-12T09:00:00.000Z');
const clock = (tick: number) => new Date(BASE + tick * 60_000).toISOString();

function created(def: BoardDefinition, again = false): PracticeState | null {
  const first = def.steps[0];
  if (!first) return null;
  const id = `${itemPrefix(def.item)}-1`;
  const title = sampleTitle(def);
  const fields: Record<string, unknown> = { [TITLE]: title };
  for (const { ref } of def.form) {
    const part = partOf(def, ref);
    if (part && !isEvidence(part)) fields[ref] = sampleRaw(part, part.name.length);
  }
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
    log: [{ kind: 'created', id, step: first.name, ...(again ? { again } : {}) }],
    said: null,
  };
}

export function startPractice(def: BoardDefinition): PracticeState | null {
  return created(clone(def));
}

export function restartPractice(state: PracticeState): PracticeState {
  return created(state.def, true) ?? state;
}

export type ChecklistRow = {
  ref: string;
  name: string;
  req: Requirement;
  fresh: boolean;
  evidence: boolean;
  ok: boolean;
};

export type PracticeView = {
  closed: boolean;
  step: string;
  phase: Phase;
  round: number;
  rounds: Rounds;
  dips: Rounds['dips'];
  ways: Target[];
  way: Target;
  checklist: ChecklistRow[];
  // Who plays now: you, the step's agent, or its agent reviewer.
  actor: 'you' | 'agent' | 'reviewer';
  agent: string | null;
};

const roundsNow = (s: PracticeState): Rounds =>
  roundsOf(
    s.def,
    stateOf({ step: s.def.steps[0]?.id ?? '', phase: 'doing' }),
    s.createdAt,
    s.transitions,
  );

const factsOf = (s: PracticeState, rounds: Rounds, step: string) => ({
  fields: s.fields,
  evidence: s.evidence,
  ...(rounds.startedAt[step] ? { roundStartedAt: rounds.startedAt[step] } : {}),
});

export function practiceView(s: PracticeState): PracticeView {
  const rounds = roundsNow(s);
  if (isClosed(s.position))
    return {
      closed: true,
      step: DONE,
      phase: 'doing',
      round: 1,
      rounds,
      dips: rounds.dips,
      ways: [],
      way: DONE,
      checklist: [],
      actor: 'you',
      agent: null,
    };
  const { step: stepId, phase } = s.position;
  const step = stepById(s.def, stepId);
  const ways = waysOf(s.def, stepId);
  const way = s.way && ways.includes(s.way) ? s.way : (ways[0] ?? DONE);
  const facts = factsOf(s, rounds, stepId);
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
  return {
    closed: false,
    step: stepId,
    phase,
    round: rounds.rounds[stepId] ?? 1,
    rounds,
    dips: rounds.dips,
    ways,
    way,
    checklist,
    actor,
    agent,
  };
}

// Attach or fill one part of the step's handoff (a practice value: every box ticked).
export function fillPart(s: PracticeState, ref: string): PracticeState {
  const part = partOf(s.def, ref);
  if (!part) return s;
  const at = clock(s.tick);
  if (isEvidence(part))
    return { ...s, tick: s.tick + 1, evidence: [...s.evidence, { part: ref, at }], said: null };
  return {
    ...s,
    tick: s.tick + 1,
    fields: { ...s.fields, [ref]: sampleRaw(part, part.name.length) },
    said: null,
  };
}

export function pickWay(s: PracticeState, way: Target): PracticeState {
  return { ...s, way };
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
  };
  return isClosed(to) ? { ...next, log: [...next.log, { kind: 'done', id: s.id }] } : next;
}

export function handOff(s: PracticeState): PracticeState {
  if (isClosed(s.position) || s.position.phase !== 'doing') return s;
  const view = practiceView(s);
  const step = stepById(s.def, s.position.step);
  if (!step) return s;
  const who = view.actor === 'you' ? null : view.agent;
  const by: Performer =
    who === null ? { kind: 'human', name: 'you' } : { kind: 'agent', name: who };
  const anyAgent: Performer = { kind: 'agent', name: 'agent' };
  const result = handoff(s.def, s.position, factsOf(s, view.rounds, step.id), {
    by: view.actor === 'agent' && who === null ? anyAgent : by,
    ...(step.reviewer === 'none' ? { way: view.way } : {}),
  });
  if (!result.ok) {
    const missing = result.code === 'missing' ? result.missing.map(({ name }) => name) : [];
    return {
      ...s,
      log: [...s.log, { kind: 'refused', by: actorOf(view), who, missing }],
      said: { kind: 'refused', missing },
    };
  }
  return moved(s, result.to, [
    { kind: 'handed', by: actorOf(view), who, step: step.name, round: view.round },
  ]);
}

export function approvePractice(s: PracticeState): PracticeState {
  if (isClosed(s.position) || s.position.phase === 'doing') return s;
  const view = practiceView(s);
  const step = stepById(s.def, s.position.step);
  const result = approve(s.def, s.position, view.way);
  if (!result.ok || !step) return s;
  const who = view.actor === 'you' ? null : view.agent;
  return moved(s, result.to, [
    { kind: 'approved', by: actorOf(view), who, step: step.name, to: view.way },
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
  return { ...next, said: { kind: 'back', step: target?.name ?? '', round, fresh } };
}

export const reviewerIsAgent = (def: BoardDefinition, stepId: string): boolean => {
  const step = stepById(def, stepId);
  return step !== undefined && isAgent(step.reviewer);
};

const actorOf = (view: PracticeView): Actor => (view.actor === 'you' ? 'you' : 'agent');
