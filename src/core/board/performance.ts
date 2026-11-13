import { isClosed, positionOf, roundsOf, type Transition } from './engine.ts';
import { type HistoryEvent, withoutUndone } from './history.ts';
import { type BoardDefinition, DONE, DROPPED, stepById, stepIndex } from './model.ts';

// How each model performs, after the fact: per model family and effort (and per exact model, per
// board and step), how often its handoffs come back, how many rounds a step it finishes takes, and
// how long it works from claim to handoff. The profile that counts is the one on the handoff, as
// the agent declared it. Steps the person does, and agents with no profile, are left out.

// The profile an event keeps, as the store reads it.
export type EventProfile = { harness?: string; model: string; effort: string; family: string };

export type PerformanceEvent = HistoryEvent & { profile?: EventProfile };

// One item's history on its board: `start` is where and when it started when its events do not say.
export type ItemTrail = {
  item: string;
  board: string;
  def: BoardDefinition;
  events: readonly PerformanceEvent[];
  start: { initial: string; createdAt: string };
};

export type Numbers = {
  // Handoffs of a step's work, and how many of them came back for another round.
  handoffs: number;
  sentBack: number;
  // Steps finished (the item went on past them, or to Hecho) and the rounds they took in all.
  finishedSteps: number;
  rounds: number;
  // Items closed as Hecho it handed off part of, and items discarded after its last handoff.
  itemsFinished: number;
  discards: number;
  // From the claim to the handoff, the middle one; null when no handoff followed a claim.
  medianClaimToHandoffMs: number | null;
};

export type ModelRow = Numbers & { model: string };
export type StepRow = Numbers & { board: string; step: string; stepName: string };
export type PerformanceRow = Numbers & {
  family: string;
  effort: string;
  models: ModelRow[];
  steps: StepRow[];
};

export type PerformanceReport = { rows: PerformanceRow[]; total: Numbers };

// The board's own moves (a publish, a restore, the reading of a preset): not the work.
const BOARD_MOVES = new Set(['publish', 'restore', 'migrate']);

type Handoff = {
  item: string;
  board: string;
  step: string;
  stepName: string;
  profile: EventProfile;
  at: string;
  claimMs: number | null;
  sentBack: boolean;
};

type Facts = {
  handoffs: Handoff[];
  // A finished step: the last handoff of it, its rounds and when the item went on.
  finished: { by: Handoff; rounds: number; at: string }[];
  discards: { by: Handoff; at: string }[];
  done: { item: string; by: Handoff[]; at: string }[];
};

const words = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const stepNameOf = (def: BoardDefinition, step: string) => stepById(def, step)?.name ?? step;

// Where a move from `from` to `to` takes the step's work: on (a review of it, a later step, Hecho),
// back (to this step from its review, or to an earlier one), or neither.
function isForward(def: BoardDefinition, from: string, to: string): boolean {
  const target = positionOf(to);
  if (isClosed(target)) return target.closed === DONE;
  if (target.step === from) return target.phase !== 'doing';
  return stepIndex(def, target.step) > stepIndex(def, from);
}

function factsOf(trail: ItemTrail): Facts {
  const { def, item, board } = trail;
  const live = withoutUndone(trail.events);
  const moves = live.filter(
    ({ type, data }) => type === 'transitioned' && words(data.from) && words(data.to),
  );
  const cut = moves.findLastIndex(({ data }) => data.reason === 'migrate');
  const reading = moves[cut];
  const created = live.find(({ type }) => type === 'created');
  const initial = reading
    ? String(reading.data.to)
    : words(created?.data.state)
      ? created.data.state
      : trail.start.initial;
  const createdAt = reading ? reading.at : trail.start.createdAt;
  const after = reading?.id ?? Number.NEGATIVE_INFINITY;
  const claims = live.filter(({ type, id }) => type === 'claimed' && id > after);
  const out: Facts = { handoffs: [], finished: [], discards: [], done: [] };
  const transitions: Transition[] = [];
  // The last handoff of each step that may still come back, and the last of each step and of the
  // item (undefined when the person, or an agent with no profile, did it).
  const pending = new Map<string, Handoff>();
  const lastOf = new Map<string, Handoff | undefined>();
  const leftAt = new Map<string, string>();
  let last: Handoff | undefined;
  let previousAt = Number.NEGATIVE_INFINITY;
  for (const move of moves.slice(cut + 1)) {
    const from = String(move.data.from);
    const to = String(move.data.to);
    const quiet = BOARD_MOVES.has(String(move.data.reason));
    transitions.push({ from, to, at: move.at, ...(quiet ? { quiet: true } : {}) });
    const source = positionOf(from);
    const target = positionOf(to);
    if (quiet || isClosed(source)) {
      previousAt = move.id;
      continue;
    }
    // A send-back: into a step's doing from its review or a later step (the engine's dips).
    if (!isClosed(target) && target.phase === 'doing') {
      const fromIndex = stepIndex(def, source.step);
      const toIndex = stepIndex(def, target.step);
      const back = source.phase !== 'doing' ? toIndex <= fromIndex : toIndex < fromIndex;
      const returned = back ? pending.get(target.step) : undefined;
      if (returned) {
        returned.sentBack = true;
        pending.delete(target.step);
      }
    }
    if (source.phase === 'doing' && isForward(def, source.step, to)) {
      const handoff = handoffOf(move, source.step);
      if (handoff) out.handoffs.push(handoff);
      if (handoff) pending.set(source.step, handoff);
      else pending.delete(source.step);
      lastOf.set(source.step, handoff);
      last = handoff;
    }
    if (isForward(def, source.step, to) && (isClosed(target) || target.step !== source.step)) {
      leftAt.set(source.step, move.at);
    }
    if (isClosed(target)) {
      if (target.closed === DROPPED && last) out.discards.push({ by: last, at: move.at });
      if (target.closed === DONE) out.done.push({ item, by: [...out.handoffs], at: move.at });
    }
    previousAt = move.id;
  }
  // Steps the item went on past, as it stands now: each one's last handoff, and its rounds.
  const now = transitions.at(-1)?.to ?? initial;
  const position = positionOf(now);
  const { rounds } = roundsOf(def, initial, createdAt, transitions);
  for (const [step, by] of lastOf) {
    if (!by) continue;
    const past = isClosed(position)
      ? position.closed === DONE
      : stepIndex(def, position.step) > stepIndex(def, step);
    const at = leftAt.get(step);
    if (past && at) out.finished.push({ by, rounds: rounds[step] ?? 1, at });
  }
  return out;

  function handoffOf(move: PerformanceEvent, step: string): Handoff | undefined {
    if (move.actor.kind !== 'agent' || !move.profile) return undefined;
    const claim = claims.findLast(
      ({ id, actor }) => id < move.id && id > previousAt && actor.name === move.actor.name,
    );
    return {
      item,
      board,
      step,
      stepName: stepNameOf(def, step),
      profile: move.profile,
      at: move.at,
      claimMs: claim ? Date.parse(move.at) - Date.parse(claim.at) : null,
      sentBack: false,
    };
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? high : ((sorted[middle - 1] ?? 0) + high) / 2;
}

// The numbers of the handoffs, finished steps, discards and finished items that pass `keep`.
function numbersOf(facts: Facts[], keep: (handoff: Handoff) => boolean): Numbers {
  const handoffs = facts.flatMap((f) => f.handoffs.filter(keep));
  const finished = facts.flatMap((f) => f.finished.filter(({ by }) => keep(by)));
  const items = new Set(
    facts.flatMap((f) => f.done.filter(({ by }) => by.some(keep)).map(({ item }) => item)),
  );
  const claimed = handoffs.flatMap(({ claimMs }) => (claimMs === null ? [] : [claimMs]));
  return {
    handoffs: handoffs.length,
    sentBack: handoffs.filter(({ sentBack }) => sentBack).length,
    finishedSteps: finished.length,
    rounds: finished.reduce((sum, { rounds }) => sum + rounds, 0),
    itemsFinished: items.size,
    discards: facts.flatMap((f) => f.discards.filter(({ by }) => keep(by))).length,
    medianClaimToHandoffMs: median(claimed),
  };
}

const groupOf = ({ family, effort }: EventProfile) => JSON.stringify([family, effort]);

const byHandoffs = (a: Numbers, b: Numbers) => b.handoffs - a.handoffs;

// Every item's facts in the period (handoffs by when they were made, finished steps, discards and
// items by when they happened), grouped by family and effort. `since`: an ISO time, or all.
export function modelPerformance(
  trails: readonly ItemTrail[],
  { since }: { since?: string | undefined } = {},
): PerformanceReport {
  const inPeriod = (at: string) => since === undefined || at >= since;
  const facts = trails.map(factsOf).map(
    (f): Facts => ({
      handoffs: f.handoffs.filter(({ at }) => inPeriod(at)),
      finished: f.finished.filter(({ at }) => inPeriod(at)),
      discards: f.discards.filter(({ at }) => inPeriod(at)),
      done: f.done.filter(({ at }) => inPeriod(at)),
    }),
  );
  const seen = new Map<string, EventProfile>();
  for (const f of facts) {
    for (const h of [
      ...f.handoffs,
      ...f.finished.map(({ by }) => by),
      ...f.discards.map(({ by }) => by),
    ])
      if (!seen.has(groupOf(h.profile))) seen.set(groupOf(h.profile), h.profile);
  }
  const rows = [...seen.entries()].map(([key, { family, effort }]): PerformanceRow => {
    const inGroup = (h: Handoff) => groupOf(h.profile) === key;
    const models = new Set<string>();
    const steps = new Map<string, Handoff>();
    for (const f of facts) {
      for (const h of [...f.handoffs, ...f.finished.map(({ by }) => by)].filter(inGroup)) {
        models.add(h.profile.model);
        steps.set(JSON.stringify([h.board, h.step]), h);
      }
    }
    return {
      family,
      effort,
      ...numbersOf(facts, inGroup),
      models: [...models]
        .map((model) => ({
          model,
          ...numbersOf(facts, (h) => inGroup(h) && h.profile.model === model),
        }))
        .sort(byHandoffs),
      steps: [...steps.values()]
        .map(({ board, step, stepName }) => ({
          board,
          step,
          stepName,
          ...numbersOf(facts, (h) => inGroup(h) && h.board === board && h.step === step),
        }))
        .sort(byHandoffs),
    };
  });
  return { rows: rows.sort(byHandoffs), total: numbersOf(facts, () => true) };
}

const PERIOD = /^(\d+)([dh])$/;
const UNIT_MS = { d: 24 * 60 * 60_000, h: 60 * 60_000 } as const;

export const PERIOD_HINT = 'a period such as 7d, 30d or 12h, or all';

// A period back from now (`30d`, `7d`, `12h`) as the ISO time it starts at: `{}` for `all` (no
// limit), null for anything else.
export function parsePeriod(text: string, now: string): { since?: string } | null {
  if (text === 'all') return {};
  const match = PERIOD.exec(text);
  const count = Number(match?.[1]);
  if (!match || !(count > 0)) return null;
  const unit = match[2] as keyof typeof UNIT_MS;
  return { since: new Date(Date.parse(now) - count * UNIT_MS[unit]).toISOString() };
}
