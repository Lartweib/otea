import type { DatabaseSync } from 'node:sqlite';
import {
  type ItemQuestion,
  openQuestion,
  QUESTION_ANSWERED,
  QUESTION_ASKED,
} from '../core/board/questions.ts';
import { type EventRecord, selectEvents, selectEventsOfTypes } from '../store/queries.ts';

// What a reader sees of an item an agent asked the person about (otea ask): the question still
// open, which hands the turn to the person until they answer it.
export type Asks = { question: number; by: string; text: string; at: string };

// The open question of every item that has one, by item id, read in one query.
export function askingItems(db: DatabaseSync): Map<string, ItemQuestion> {
  const events = selectEventsOfTypes(db, [QUESTION_ASKED, QUESTION_ANSWERED, 'transitioned']);
  const byItem = new Map<string, EventRecord[]>();
  for (const event of events) {
    const list = byItem.get(event.itemId) ?? [];
    list.push(event);
    byItem.set(event.itemId, list);
  }
  const out = new Map<string, ItemQuestion>();
  for (const [id, each] of byItem) {
    const open = openQuestion(each);
    if (open) out.set(id, open);
  }
  return out;
}

// The open question of one item, if any.
export function askingItem(db: DatabaseSync, id: string): ItemQuestion | undefined {
  return openQuestion(selectEvents(db, id));
}

// An item as readers see it while a question waits: the person's turn, and the question.
export function withAsks<T extends { turn: string }>(
  item: T,
  open: ItemQuestion | undefined,
): T & { asks?: Asks } {
  if (!open || item.turn !== 'agent') return item;
  const asks = { question: open.question, by: open.by, text: open.text, at: open.at };
  return { ...item, turn: 'human', asks };
}
