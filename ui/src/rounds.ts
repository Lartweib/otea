import { isClosed, positionOf } from '../../src/core/board/engine.ts';
import {
  HANDOFF_AMENDED,
  historyOf,
  roundsOfStep,
  withoutUndone,
} from '../../src/core/board/history.ts';
import { type BoardDefinition, stepIndex } from '../../src/core/board/model.ts';
import { relayOf } from './format.ts';
import type { Actor, Closing, Evidence, ItemEvent, State } from './types.ts';

// Rounds are read from an item's history, never stored. Round n ends with the agent's nth move into
// a state on the human's turn; that move's note (else its reason) is the round's note, and what was
// attached since the round before ended belongs to it. The human's next move is its verdict: back
// to a working state is "sent back", its reason the feedback; into a closed state ends the rounds.
// A move the person took back with Deshacer never happened.
//
// On a board the rounds are its step's, numbered as the step engine counts them
// (core/board/history.ts): only the handoffs of `step` (the step the item is on; once closed, the
// last one handed off), and a verdict that moves it on to a later step is "approved".

export type Verdict = {
  kind: 'sent-back' | 'approved' | 'closed';
  to: string;
  at: string;
  actor: Actor;
  reason?: string;
  closes?: Closing;
  // The agent that relayed it, when the human gave it in conversation.
  relayedBy?: string;
};

export type Round = {
  n: number;
  // The move that ended it.
  endedAt: string;
  to: string;
  by: Actor;
  note?: string;
  evidence: Evidence[];
  verdict?: Verdict;
};

export type BoardRounds = { def: BoardDefinition; step?: string };

const textOf = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;
const reasonOf = (event: ItemEvent) => textOf(event.data.reason);
const noteOf = (event: ItemEvent) => textOf(event.data.note) ?? reasonOf(event);

// The step a move left, on a board; undefined off its steps.
const stepLeft = (event: ItemEvent): string | undefined => {
  const from = positionOf(String(event.data.from));
  return isClosed(from) ? undefined : from.step;
};

// A verdict's kind on a board: closed, back to this step or an earlier one, or on to a later one.
function boardVerdict(def: BoardDefinition, step: string, to: string): Verdict['kind'] {
  const target = positionOf(to);
  if (isClosed(target)) return 'closed';
  return stepIndex(def, target.step) <= stepIndex(def, step) ? 'sent-back' : 'approved';
}

export function roundsOf(
  events: readonly ItemEvent[],
  evidence: readonly Evidence[],
  states: readonly State[],
  board?: BoardRounds,
): Round[] {
  const turn = new Map(states.map((state) => [state.name, state]));
  const live = withoutUndone([...events].sort((a, b) => a.id - b.id));
  const rounds: (Round & { step?: string })[] = [];
  let since = '';
  for (const event of live) {
    // The agent amended its handoff's note while the review waited (P3C-11).
    if (event.type === HANDOFF_AMENDED) {
      const open = rounds.at(-1);
      const note = textOf(event.data.note);
      if (open && !open.verdict && note) open.note = note;
      continue;
    }
    if (event.type !== 'transitioned') continue;
    const to = String(event.data.to);
    const state = turn.get(to);
    const open = rounds.at(-1);
    const relay = relayOf(event);
    // On a board a round ends with the doer's handoff out of the step's doing, whoever reviews it
    // (an agent reviewer too); an agent's move out of a review is that review's verdict.
    const from = positionOf(String(event.data.from));
    const reviewing = !isClosed(from) && from.phase === 'review';
    const target = positionOf(to);
    const handoff = board
      ? !reviewing && (state?.turn === 'human' || (!isClosed(target) && target.phase === 'review'))
      : state?.turn === 'human';
    if (event.actor.kind === 'agent' && !relay && handoff) {
      const note = board ? noteOf(event) : reasonOf(event);
      const step = board ? stepLeft(event) : undefined;
      rounds.push({
        n: rounds.length + 1,
        endedAt: event.at,
        to,
        by: event.actor,
        ...(note ? { note } : {}),
        // What the person attached meanwhile (a reference) is theirs, no evidence of the round
        // (P5-R3-1): it is never compared with the next round, nor listed as gone from it.
        evidence: evidence.filter(
          ({ createdAt, actor }) =>
            actor.kind !== 'human' && createdAt > since && createdAt <= event.at,
        ),
        ...(step ? { step } : {}),
      });
      since = event.at;
      continue;
    }
    const agentReview = Boolean(board) && event.actor.kind === 'agent' && reviewing;
    if (open && !open.verdict && (event.actor.kind === 'human' || relay || agentReview)) {
      const reason = reasonOf(event);
      const closes = state?.closes;
      const kind =
        board && open.step
          ? boardVerdict(board.def, open.step, to)
          : state?.turn === 'none'
            ? 'closed'
            : 'sent-back';
      open.verdict = {
        kind,
        to,
        at: event.at,
        actor: event.actor,
        ...(reason ? { reason } : {}),
        ...(closes ? { closes } : {}),
        ...(relay ? { relayedBy: relay.via } : {}),
      };
    }
  }
  if (!board) return rounds;
  return stepRounds(board, live, rounds);
}

// A board's rounds of one step, numbered by the engine: each handoff is in the round of its step
// that was under way when it was made.
function stepRounds(
  board: BoardRounds,
  events: readonly ItemEvent[],
  rounds: (Round & { step?: string })[],
): Round[] {
  const step = board.step ?? rounds.at(-1)?.step;
  if (step === undefined) return [];
  const created = events.find(({ type }) => type === 'created');
  const history = historyOf(events, {
    initial: board.def.steps[0]?.id ?? step,
    createdAt: created?.at ?? '',
  });
  const starts = roundsOfStep(board.def, history, step);
  return rounds
    .filter((round) => round.step === step)
    .map(({ step: _, ...round }) => ({
      ...round,
      n: starts.findLast(({ at }) => at <= round.endedAt)?.round ?? 1,
    }));
}

// The files of a round a module draws, newest first; with the same file in the round before, the
// comparison of the two.
export function roundFiles(round: Round | undefined, module: string): Evidence[] {
  return (round?.evidence ?? [])
    .filter((entry) => entry.module === module)
    .sort((a, b) => b.id - a.id);
}

// The words a file's name says, to tell it again in another round under a new name: its letters
// split at anything else, without its extension, numbers or round marks (r2, v3, ronda).
const ROUND_MARK = /^(?:[rv]\d+|round|ronda|final|new|nuevo|nueva|old|viejo|vieja)$/;

function nameWords(filename: string): Set<string> {
  const stem = filename.replace(/\.[^.]+$/, '').toLocaleLowerCase();
  return new Set(
    stem
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !/^\d+$/.test(word) && !ROUND_MARK.test(word)),
  );
}

function sharedWords(a: Evidence, b: Evidence): number {
  const theirs = nameWords(b.filename);
  return [...nameWords(a.filename)].filter((word) => theirs.has(word)).length;
}

// The files of two rounds paired to be compared, by name, never by their place (P5-R3-1: a file
// of the person's in the first round shifted every pair): a file with the same name in both; else
// the one whose name shares the most words with it (logo-2026-chico and r2-logo-chico); a lone
// file on each side pairs whatever their names. What is left stands alone, the newer's in its
// place, the older's after.
export function namePairs(
  older: readonly Evidence[],
  newer: readonly Evidence[],
): { before?: Evidence; after?: Evidence }[] {
  const used = new Set<Evidence>();
  const match = new Map<Evidence, Evidence>();
  const take = (after: Evidence, before: Evidence) => {
    used.add(before);
    match.set(after, before);
  };
  for (const after of newer) {
    const same = older.find((e) => !used.has(e) && e.filename === after.filename);
    if (same) take(after, same);
  }
  for (const after of newer) {
    if (match.has(after)) continue;
    let best: Evidence | undefined;
    let score = 0;
    for (const e of older) {
      const shared = used.has(e) ? 0 : sharedWords(e, after);
      if (shared > score) [best, score] = [e, shared];
    }
    if (best) take(after, best);
  }
  const [lone] = older;
  const [only] = newer;
  if (older.length === 1 && newer.length === 1 && lone && only && !match.has(only))
    take(only, lone);
  const pairs = newer.map((after) => {
    const before = match.get(after);
    return before ? { before, after } : { after };
  });
  return [...pairs, ...older.filter((e) => !used.has(e)).map((before) => ({ before }))];
}

// The two files of a module Comparar rondas shows for rounds A and B: the newest of B's with its
// pair by name in A (namePairs); with no pair, the newest of each, as a module with one file a
// round has.
export function comparedFiles(
  a: Round | undefined,
  b: Round | undefined,
  module: string,
): { a?: Evidence; b?: Evidence } {
  const was = roundFiles(a, module);
  const now = roundFiles(b, module);
  const pair = namePairs(was, now).find(({ before, after }) => before && after);
  const fileA = pair?.before ?? was[0];
  const fileB = pair?.after ?? now[0];
  return { ...(fileA ? { a: fileA } : {}), ...(fileB ? { b: fileB } : {}) };
}

// The version of the picture `shown` in the last round before its own that has pictures among
// `files`, paired by name as namePairs pairs two rounds (the phone's Comparar, #472): what the desk
// gallery compares it with. `from` and `to` are the two rounds. Undefined in its first round, off a
// review (no round known), or when no picture of that round goes with it.
export function earlierRoundPair(
  files: readonly Evidence[],
  roundOf: ReadonlyMap<number, number>,
  shown: Evidence,
): { before: Evidence; from: number; to: number } | undefined {
  const to = roundOf.get(shown.id);
  if (to === undefined) return undefined;
  const roundsBefore = files
    .map(({ id }) => roundOf.get(id))
    .filter((n): n is number => n !== undefined && n < to);
  if (roundsBefore.length === 0) return undefined;
  const from = Math.max(...roundsBefore);
  const of = (n: number) => files.filter(({ id }) => roundOf.get(id) === n);
  const before = namePairs(of(from), of(to)).find(({ after }) => after === shown)?.before;
  return before ? { before, from, to } : undefined;
}
