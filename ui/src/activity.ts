import { relayOf } from './format.ts';
import { activeLease } from './lease.ts';
import type { CollectionView, Item, ItemEvent, Turn } from './types.ts';

// An event of the project's log, as GET /api/events serves it: an item event that names its item.
export type FeedEvent = ItemEvent & { itemId: string };

// What the feed filters by. Everything else (created, edited, linked) shows under all.
export const ACTIVITY_KINDS = ['all', 'lease', 'handoff', 'evidence'] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// How many of the newest events the drawer reads when it opens, and keeps as more arrive.
export const FEED_SIZE = 200;

// Whose turn a state of an item is, from the item's type in its collection.
export type TurnOf = (itemId: string, state: string) => Turn | undefined;

export function turnLookup(items: readonly Item[], collections: readonly CollectionView[]): TurnOf {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (itemId, state) => {
    const item = byId.get(itemId);
    const collection = collections.find((each) => each.name === item?.collection);
    const type = collection?.types.find((each) => each.name === item?.type);
    return type?.states.find((each) => each.name === state)?.turn;
  };
}

// One line of the feed: the lane its dot sits in (an agent's acts on the left; yours, and what it
// hands you, on the right),
// who acted (an agent's name; none when you did), and the sentence, as a message key and its holes.
export type FeedLine = {
  event: FeedEvent;
  kind: Exclude<ActivityKind, 'all'> | 'other';
  lane: 'agent' | 'you';
  relayed: boolean;
  agent: string | null;
  phrase: Phrase;
};

export type Phrase =
  | { key: 'activity.claimed'; time: string }
  | { key: 'activity.claimedOver'; previous: string }
  | { key: 'activity.released' }
  | { key: 'activity.handed'; state: string }
  | { key: 'activity.moved'; state: string }
  | { key: 'activity.created'; state: string }
  | { key: 'activity.attached'; file: string }
  | { key: 'activity.edited' }
  | { key: 'activity.linked' | 'activity.unlinked'; kind: string; from: string; to: string }
  | { key: 'activity.other'; type: string };

const MINUTE = 60_000;

// A lease's length as the feed says it: 15m, 2h, 90s.
export function spanOf(ms: number): string {
  if (!(ms > 0)) return '0s';
  if (ms < MINUTE) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.round(ms / MINUTE);
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

function phraseOf(event: FeedEvent, turnOf: TurnOf): Pick<FeedLine, 'kind' | 'phrase'> {
  const { type, data, at } = event;
  const text = (value: unknown) => String(value ?? '');
  if (type === 'claimed') {
    if (typeof data.previous === 'string') {
      return { kind: 'lease', phrase: { key: 'activity.claimedOver', previous: data.previous } };
    }
    const time = spanOf(Date.parse(text(data.expiresAt)) - Date.parse(at));
    return { kind: 'lease', phrase: { key: 'activity.claimed', time } };
  }
  if (type === 'released') return { kind: 'lease', phrase: { key: 'activity.released' } };
  if (type === 'transitioned') {
    const state = text(data.to);
    const handed = event.actor.kind === 'agent' && turnOf(event.itemId, state) === 'human';
    return handed
      ? { kind: 'handoff', phrase: { key: 'activity.handed', state } }
      : { kind: 'other', phrase: { key: 'activity.moved', state } };
  }
  if (type === 'evidence_added') {
    return { kind: 'evidence', phrase: { key: 'activity.attached', file: text(data.filename) } };
  }
  if (type === 'created')
    return { kind: 'other', phrase: { key: 'activity.created', state: text(data.state) } };
  if (type === 'updated') return { kind: 'other', phrase: { key: 'activity.edited' } };
  if (type === 'relation_added' || type === 'relation_removed') {
    const key = type === 'relation_added' ? 'activity.linked' : 'activity.unlinked';
    return {
      kind: 'other',
      phrase: { key, kind: text(data.kind), from: text(data.from), to: text(data.to) },
    };
  }
  return { kind: 'other', phrase: { key: 'activity.other', type } };
}

// The feed, newest first. A lease released on a handoff is not drawn apart: the handoff says it.
export function feedLines(events: readonly FeedEvent[], turnOf: TurnOf): FeedLine[] {
  return events
    .filter((event) => !(event.type === 'released' && event.data.cause === 'handoff'))
    .map((event) => {
      const relay = relayOf(event);
      const agent = relay ? relay.via : event.actor.kind === 'agent' ? event.actor.name : null;
      const said = phraseOf(event, turnOf);
      // A handoff lands in your lane: from then on the item is yours.
      const yours = event.actor.kind !== 'agent' || said.kind === 'handoff';
      return {
        event,
        ...said,
        lane: yours ? 'you' : 'agent',
        relayed: relay !== null,
        agent,
      } satisfies FeedLine;
    })
    .reverse();
}

export function shownLines(
  lines: readonly FeedLine[],
  kind: ActivityKind,
  agent: string | null,
): FeedLine[] {
  return lines.filter(
    (line) => (kind === 'all' || line.kind === kind) && (agent === null || line.agent === agent),
  );
}

// A lease an agent holds now: how long it was granted for (from its claim, 15m when the claim is
// older than the feed), when it was claimed and when it was last renewed, as far as the log tells.
// A heartbeat writes no event: a renewal shows as an expiry later than the claim's own.
export type HeldLease = {
  holder: string;
  item: Item;
  expiresAt: string;
  ttlMs: number;
  claimedAt?: string;
  renewedAt?: string;
};

// An agent the feed saw that holds nothing now, and the last thing it did.
export type IdleAgent = { name: string; last: FeedLine };

const DEFAULT_TTL_MS = 15 * MINUTE;

export function heldLeases(
  items: readonly Item[],
  events: readonly FeedEvent[],
  now: number,
): HeldLease[] {
  return items
    .flatMap((item) => {
      const lease = activeLease(item.lease, now);
      if (!lease) return [];
      const claim = events.findLast(
        (event) =>
          event.itemId === item.id &&
          event.type === 'claimed' &&
          event.data.holder === lease.holder,
      );
      const granted = claim ? Date.parse(String(claim.data.expiresAt)) : Number.NaN;
      const ttlMs =
        claim && granted > Date.parse(claim.at) ? granted - Date.parse(claim.at) : DEFAULT_TTL_MS;
      const expires = Date.parse(lease.expiresAt);
      const renewed =
        claim && expires > granted ? new Date(expires - ttlMs).toISOString() : undefined;
      return [
        {
          holder: lease.holder,
          item,
          expiresAt: lease.expiresAt,
          ttlMs,
          ...(claim ? { claimedAt: claim.at } : {}),
          ...(renewed ? { renewedAt: renewed } : {}),
        },
      ];
    })
    .sort((a, b) => a.holder.localeCompare(b.holder) || a.item.id.localeCompare(b.item.id));
}

export function idleAgents(lines: readonly FeedLine[], held: readonly HeldLease[]): IdleAgent[] {
  const busy = new Set(held.map((lease) => lease.holder));
  const seen = new Map<string, FeedLine>();
  for (const line of lines) {
    if (line.agent && !busy.has(line.agent) && !seen.has(line.agent)) seen.set(line.agent, line);
  }
  return [...seen]
    .map(([name, last]) => ({ name, last }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The share of the lease still left, for its dial: 1 just claimed or renewed, 0 once it runs out.
export function leftShare(lease: Pick<HeldLease, 'expiresAt' | 'ttlMs'>, now: number): number {
  const left = Date.parse(lease.expiresAt) - now;
  return Math.max(0, Math.min(1, left / lease.ttlMs));
}

// The time left as the dial says it, to the second: 6:12, 0:48; 1:02:10 past an hour.
export function clockLeft(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = `${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

// New events after the cursor join the feed; it keeps the newest FEED_SIZE.
export function mergeFeed(
  current: readonly FeedEvent[],
  arrived: readonly FeedEvent[],
): FeedEvent[] {
  const last = current.at(-1)?.id ?? 0;
  const fresh = arrived.filter((event) => event.id > last);
  return [...current, ...fresh].slice(-FEED_SIZE);
}
