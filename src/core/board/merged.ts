import type { EventRecord } from '../../store/queries.ts';

export const MERGED = 'merged';

// That a Done item's branch is in: who said so, when, and the PR and commit when given.
export type Merged = { at: string; by: string; branch?: string; pr?: string; commit?: string };

// The merge of a Done item, as its last `merged` event says it; undefined until one is recorded.
export function mergedFrom(events: readonly EventRecord[]): Merged | undefined {
  const event = events.findLast(({ type }) => type === MERGED);
  if (!event) return undefined;
  const text = (key: string) => {
    const value = event.data[key];
    return typeof value === 'string' && value !== '' ? { [key]: value } : {};
  };
  return {
    at: event.at,
    by: event.actor.name,
    ...text('branch'),
    ...text('pr'),
    ...text('commit'),
  };
}
