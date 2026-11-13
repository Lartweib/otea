import type { Actor } from '../item.ts';
import { isClosed, positionOf, roundsOf, stateOf, type Transition } from './engine.ts';
import { type BoardDefinition, stepIndex } from './model.ts';

// An item's history as the step engine replays it, read the same way by the server, the CLI, MCP
// and the web page, so every one of them counts the same rounds and reads the same notes.

export type HistoryEvent = {
  id: number;
  type: string;
  actor: Actor;
  at: string;
  data: Record<string, unknown>;
};

// A move the person took back while its toast was up leaves two events: the move and its undo
// (which names it). Both are dropped, as if the move never happened: an approval taken back starts
// no round, a send-back taken back leaves no note.
export function withoutUndone<E extends Pick<HistoryEvent, 'id' | 'data'>>(
  events: readonly E[],
): E[] {
  const gone = new Set<number>();
  for (const e of events) if (typeof e.data.undoes === 'number') gone.add(e.data.undoes).add(e.id);
  return gone.size === 0 ? [...events] : events.filter((e) => !gone.has(e.id));
}

// Moves the board made itself, not the work: a publish or a restore placing the item, and the
// reading of a preset collection as a board.
const BOARD_MOVES = new Set(['publish', 'restore', 'migrate']);
const MIGRATE = 'migrate';

// What a move said and who made it, by the move's index: its note, else its reason (a send-back's
// note), else the quote of a relayed one. `reading`: the question a preset reading carried.
export type Said = { by: Actor; text?: string; reading?: true };

// A handoff's note as the history holds it: the step it was handed off from, how many moves came
// before it (its round is the step's round then), when and by whom.
export type HandoffNote = { step: string; before: number; note: string; at: string; by: Actor };

export type History = {
  initial: string;
  createdAt: string;
  moves: Transition[];
  said: Said[];
  notes: HandoffNote[];
  // When the item was read from a preset, the reading's time.
  readAt?: string;
};

const words = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function saidOf(data: Record<string, unknown>, by: Actor): Said {
  const text = [data.note, data.reason, data.quote].find(words);
  return text === undefined ? { by } : { by, text };
}

// The item's moves as the engine replays them, undone moves left out. A collection read from a
// preset starts its history at that reading: the states before it belong to the preset's workflow,
// not to the board's steps. A reading that carries a note (Falta información read as Completar)
// starts that step's next round, with the person's question as its note. `fallback`: where and
// when the item started when its history does not say.
export function historyOf(
  events: readonly HistoryEvent[],
  fallback: { initial: string; createdAt: string },
): History {
  const live = withoutUndone(events);
  const created = live.find(({ type }) => type === 'created');
  const moved = live.filter(
    ({ type, data }) => type === 'transitioned' && words(data.from) && words(data.to),
  );
  const migrated = moved.findLastIndex(({ data }) => data.reason === MIGRATE);
  const reading = moved[migrated];
  const out: History = {
    initial: fallback.initial,
    createdAt: fallback.createdAt,
    moves: [],
    said: [],
    notes: [],
  };
  if (reading) {
    out.initial = String(reading.data.to);
    out.createdAt = reading.at;
    out.readAt = reading.at;
    const to = positionOf(out.initial);
    const asked = words(reading.data.note) ? reading.data.note : undefined;
    if (asked !== undefined && !isClosed(to)) {
      out.moves.push({
        from: stateOf({ step: to.step, phase: 'review' }),
        to: to.step,
        at: reading.at,
      });
      out.said.push({ by: reading.actor, text: asked, reading: true });
      const by = moved
        .slice(0, migrated)
        .findLast(({ data }) => String(data.to) === String(reading.data.from))?.actor;
      out.notes.push({
        step: to.step,
        before: 1,
        note: asked,
        at: reading.at,
        by: by ?? reading.actor,
      });
    }
  } else if (typeof created?.data.state === 'string') {
    out.initial = created.data.state;
  }
  for (const { data, at, actor } of moved.slice(migrated + 1)) {
    const from = positionOf(String(data.from));
    if (words(data.note) && !isClosed(from))
      out.notes.push({ step: from.step, before: out.moves.length, note: data.note, at, by: actor });
    out.moves.push({
      from: String(data.from),
      to: String(data.to),
      at,
      ...(BOARD_MOVES.has(String(data.reason)) ? { quiet: true } : {}),
    });
    out.said.push(saidOf(data, actor));
  }
  return out;
}

// The step's round after the first `count` moves, as the engine counts it.
export function roundAfter(
  def: BoardDefinition,
  history: History,
  step: string,
  count: number,
): number {
  const { rounds } = roundsOf(
    def,
    history.initial,
    history.createdAt,
    history.moves.slice(0, count),
  );
  return rounds[step] ?? 1;
}

// Each handoff's note with the round of its step it closed, as the engine counts it.
export function handoffNotes(
  def: BoardDefinition,
  history: History,
): { step: string; round: number; note: string; at: string; by: Actor }[] {
  return history.notes.map(({ step, before, note, at, by }) => ({
    step,
    round: roundAfter(def, history, step, before),
    note,
    at,
    by,
  }));
}

// One round of a step: its number as the engine counts it, and the move that started it (its index
// in `moves`, -1 for the item's start) when that move sent it back here, with what it said.
export type RoundStart = {
  round: number;
  at: string;
  back?: { said: Said; at: string };
};

// The rounds of one step, oldest first, each started by entering the step as the engine counts it.
// A round started by a send-back (from its review or a later step, or the question a reading
// carried) keeps what that move said; one started by moving forward says nothing here.
export function roundsOfStep(def: BoardDefinition, history: History, step: string): RoundStart[] {
  const out: RoundStart[] = [];
  const index = stepIndex(def, step);
  let before = 0;
  for (let count = 0; count <= history.moves.length; count += 1) {
    const { rounds } = roundsOf(
      def,
      history.initial,
      history.createdAt,
      history.moves.slice(0, count),
    );
    const now = rounds[step] ?? 0;
    if (now > before) {
      const move = count === 0 ? undefined : history.moves[count - 1];
      const said = count === 0 ? undefined : history.said[count - 1];
      const source = move ? positionOf(move.from) : undefined;
      const back =
        move !== undefined &&
        !move.quiet &&
        source !== undefined &&
        !isClosed(source) &&
        ((source.step === step && source.phase !== 'doing') || stepIndex(def, source.step) > index);
      out.push({
        round: now,
        at: move?.at ?? history.createdAt,
        ...(back && said?.text ? { back: { said, at: move.at } } : {}),
      });
    }
    before = now;
  }
  return out;
}
