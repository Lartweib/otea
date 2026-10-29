import { type EventFilter, type EventRecord, selectEventsAfter } from '../store/queries.ts';
import { getCollection } from './collections.ts';
import type { Context } from './context.ts';
import { requireItem } from './items.ts';

// The event log across items in commit order: `since` is the id of the last event already read.
export function listEvents(ctx: Context, filter: EventFilter = {}): EventRecord[] {
  if (filter.item !== undefined) requireItem(ctx.db, filter.item);
  if (filter.collection !== undefined) getCollection(ctx.db, filter.collection);
  return selectEventsAfter(ctx.db, filter);
}
