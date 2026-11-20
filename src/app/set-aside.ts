import type { DatabaseSync } from 'node:sqlite';
import type { Actor } from '../core/item.ts';
import { timeText } from '../core/time.ts';
import { appendEvent, type EventRecord, selectEvents } from '../store/queries.ts';

// An item set aside for later (otea release --later, P3C-R2-4): next and wait leave it out until
// it moves, an agent claims it, or the set-aside lifts (P7-R3-1). It lifts on its own once the item
// is agent work again after waiting (what it waited for closed), and whenever the person acts on
// it: a note, an answer, picking it in the Matrix order, putting it on top, or Retomar. The lift is
// an event of its own, saying why, so the timeline tells why the item came back.
export const SET_ASIDE_LIFTED = 'set_aside_lifted';

// Why a set-aside lifted: its parts or what blocked it closed, or what the person did.
export type LiftCause = 'parts' | 'blockers' | 'note' | 'answer' | 'order' | 'pin' | 'resume';

// The events that end or start who has the item: the last of them says whether it stands aside.
const LEASE_EVENTS: readonly string[] = ['claimed', 'released', 'transitioned', SET_ASIDE_LIFTED];

// The agent that set the item aside and when, while nothing lifted it since; undefined otherwise.
export function setAsideOf(events: readonly EventRecord[]): { by: string; at: string } | undefined {
  const last = events.findLast(({ type }) => LEASE_EVENTS.includes(type));
  if (last?.type !== 'released' || last.actor.kind !== 'agent' || last.data.cause !== 'later')
    return undefined;
  return { by: last.actor.name, at: last.at };
}

// What the person did to take an item up again: a note, an answer, picking it in the order,
// putting it on top, or Retomar (the lifts closing a part or a blocker are no wish of theirs).
const PERSON_LIFTS: readonly string[] = ['note', 'answer', 'order', 'pin', 'resume'];

export type Retake = { by: string; cause: LiftCause; at: string; note?: number };

// The person took the item up again (P7-R3-8): their act lifted an agent's set-aside, and since
// then the item has not moved nor been set aside again (by an agent relaying their newer words).
// Undefined otherwise.
export function retakeOf(events: readonly EventRecord[]): Retake | undefined {
  const last = events.findLast(
    ({ type, data }) =>
      type === 'transitioned' ||
      type === SET_ASIDE_LIFTED ||
      (type === 'released' && data.cause === 'later'),
  );
  if (last?.type !== SET_ASIDE_LIFTED || !PERSON_LIFTS.includes(String(last.data.cause)))
    return undefined;
  const { by, cause, note } = last.data;
  return {
    by: String(by),
    cause: cause as LiftCause,
    at: last.at,
    ...(typeof note === 'number' ? { note } : {}),
  };
}

// The retake as agents read it: "Retomar, 2026-11-19 22:38 UTC".
export function retakeText({ cause, at, note }: Retake): string {
  const how: Record<LiftCause, string> = {
    note: `note ${note ?? ''}`.trim(),
    answer: 'their answer',
    order: 'picked in the order',
    pin: 'put on top',
    resume: 'Retomar',
    parts: 'its parts closed',
    blockers: 'what blocked it closed',
  };
  return `${how[cause]}, ${timeText(at)}`;
}

// Lifts the item's set-aside, if it has one, recording why; whether it had one.
export function liftSetAside(
  db: DatabaseSync,
  lift: { id: string; actor: Actor; at: string; cause: LiftCause },
  data: Record<string, unknown> = {},
): boolean {
  const aside = setAsideOf(selectEvents(db, lift.id));
  if (!aside) return false;
  appendEvent(db, {
    itemId: lift.id,
    type: SET_ASIDE_LIFTED,
    actor: lift.actor,
    at: lift.at,
    data: { by: aside.by, cause: lift.cause, ...data },
  });
  return true;
}
