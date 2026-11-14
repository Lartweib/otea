import { type ItemNote, type NoteEvent, notesOf } from '../../../../src/core/board/notes.ts';
import { modelFamily, type Profile } from '../../../../src/core/profile.ts';
import { latestFirst } from '../../evidence.ts';
import { momentParts } from '../../format.ts';
import { t } from '../../i18n/i18n.ts';
import { profilePair } from '../../profile-words.ts';
import type { Evidence, ItemEvent } from '../../types.ts';

// Notes from the person while an agent does a step (core/board/notes.ts), as the item page reads
// them: the thread, a round's part of it, the moment each was left in, the pieces of evidence a
// note can be on, and whether the agent at work has given a sign of life lately.

export type { ItemNote };

// The agent at work on the item's step and its last sign of life (the board block's `worker`).
export type Worker = { name: string; lastSeen: string | null; holds: boolean };

// The item's notes, oldest first: the board block's thread when the server sends one, else read
// from the item's events.
export function threadOf(
  block: { thread?: ItemNote[] | undefined } | undefined,
  events: readonly ItemEvent[],
): ItemNote[] {
  return block?.thread ?? notesOf(events as unknown as NoteEvent[]);
}

export function roundNotesOf(
  thread: readonly ItemNote[],
  step: string | null | undefined,
  round: number,
): ItemNote[] {
  return thread.filter((note) => note.step === step && note.round === round);
}

export function notesCount(notes: readonly ItemNote[]): { count: number; unanswered: number } {
  return { count: notes.length, unanswered: notes.filter(({ answer }) => !answer).length };
}

// The time a note was left at, as the page says times: the hour today, the day before it else.
export function noteTime(iso: string, now: number): string {
  const { day, time } = momentParts(iso, now);
  return day ? `${day} ${time}` : time;
}

// "Hacerlo · ronda 2 · 14:20 · llevaba 2 de 4 entregables": the step, the round and the time the
// note was left at, and how many of the step's required deliverables were in then.
export function noteContext(note: ItemNote, now: number): string {
  const head = t('notes.when', {
    step: note.stepName,
    round: note.round,
    time: noteTime(note.at, now),
  });
  const { done, of } = note.delivered;
  return of > 0 ? `${head} · ${t('notes.had', { done, count: of })}` : head;
}

// "opus · high": the family of the model the agent declared, and its effort.
export function profileWords(profile: Profile | undefined): string | null {
  return profile ? profilePair(modelFamily(profile.model), profile.effort) : null;
}

// An agent counts as live while it was seen this recently (LIVE_WINDOW_MS in app/presence.ts).
const QUIET_MS = 5 * 60_000;

// The minutes since the agent at work last gave a sign of life, once past the live window: a note
// may go unread then. Null while it is live, or when it was never seen.
export function quietMinutes(worker: Worker | undefined, now: number): number | null {
  if (!worker?.lastSeen) return null;
  const ms = now - Date.parse(worker.lastSeen);
  if (!Number.isFinite(ms) || ms < QUIET_MS) return null;
  return Math.round(ms / 60_000);
}

// The pieces a note can be on: what was attached in the round (from `since`), newest first.
export function anchorPieces(evidence: readonly Evidence[], since: string | undefined): Evidence[] {
  return latestFirst(evidence.filter((e) => since === undefined || e.createdAt >= since));
}

// How many notes are on each piece of evidence, by the very file the person saw.
export function notedOn(thread: readonly ItemNote[]): Map<number, number> {
  const on = new Map<number, number>();
  for (const { anchor } of thread) {
    if (anchor) on.set(anchor.evidence, (on.get(anchor.evidence) ?? 0) + 1);
  }
  return on;
}
