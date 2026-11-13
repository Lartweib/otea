import { activeLease } from '../../active-lease.ts';
import type { FeedEvent } from '../../activity.ts';
import { askingAgent, handedNote, isStuck } from '../../derive/toca.ts';
import type { Agent } from '../../presence.ts';
import type { Item, Turn } from '../../types.ts';

// The agents column (SPEC §8.2, mock:1918-1985): what each agent is doing, and its last two hours
// as a trace read from the feed.

const MIN = 60_000;
const WINDOW = 120;

// Minutes over the last two hours: 0 is two hours ago, 120 is now.
export type Trace = { work: [number, number][]; handed: number[]; quiet?: [number, number] };

// A lease of the agent's now: active, or one that ran out with nobody releasing it.
export type HeldLease = { item: string; expiresAt: string; active: boolean };

export type TraceOptions = {
  leases: readonly HeldLease[];
  turnOf: (itemId: string, state: string) => Turn | undefined;
};

const relayed = (e: FeedEvent) => typeof e.data.via === 'string';
const byAgent = (e: FeedEvent, name: string) => e.actor.kind === 'agent' && e.actor.name === name;
const r1 = (v: number) => +v.toFixed(1);

function merge(spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function agentTrace(
  feed: readonly FeedEvent[],
  name: string,
  now: number,
  o: TraceOptions,
): Trace {
  const from = now - WINDOW * MIN;
  const m = (at: number) => r1(Math.min(WINDOW, Math.max(0, (at - from) / MIN)));
  const events = [...feed].sort((a, b) => a.id - b.id);
  const spans: [number, number][] = [];
  const seen = new Set<string>();
  for (const [i, e] of events.entries()) {
    if (e.type !== 'claimed' || !byAgent(e, name)) continue;
    const start = Date.parse(e.at);
    const later = events
      .slice(i + 1)
      .find(
        (x) =>
          x.itemId === e.itemId &&
          ((x.type === 'released' && x.data.holder === name) ||
            (x.type === 'claimed' && !byAgent(x, name))),
      );
    const lease = o.leases.find((l) => l.item === e.itemId);
    const end = later
      ? Date.parse(later.at)
      : lease?.active
        ? now
        : lease
          ? Date.parse(lease.expiresAt)
          : Math.min(now, Date.parse(String(e.data.expiresAt)));
    if (!later && lease) seen.add(e.itemId);
    if (end > from) spans.push([start, end]);
  }
  // A lease held since before the feed remembers.
  for (const l of o.leases) if (l.active && !seen.has(l.item)) spans.push([from, now]);
  const work = merge(spans.map(([s, e]) => [m(s), m(e)]));
  const handed = events
    .filter(
      (e) =>
        e.type === 'transitioned' &&
        byAgent(e, name) &&
        !relayed(e) &&
        Date.parse(e.at) > from &&
        o.turnOf(e.itemId, String(e.data.to)) === 'human',
    )
    .map((e) => m(Date.parse(e.at)));
  const trace: Trace = { work, handed };
  if (!o.leases.some((l) => l.active)) {
    const ran = o.leases.filter((l) => !l.active).map((l) => Date.parse(l.expiresAt));
    if (ran.length) trace.quiet = [m(Math.max(...ran)), WINDOW];
  }
  return trace;
}

// The trace's markup in a W × 24 box (port of tracePath, mock:1919-1937): high (5.5) while it
// holds a lease, low (17.5) otherwise, in 3 px curved steps; a dotted warn tail while quiet; a
// --you drop at each handoff to you; an end dot.
export function tracePath(a: Trace, W: number): string {
  const hi = 5.5;
  const lo = 17.5;
  const x = (m: number) => r1(0.5 + (m / WINDOW) * (W - 6));
  const work = [...a.work].sort((p, q) => p[0] - q[0]);
  let y = work.length && (work[0]?.[0] ?? 1) <= 0 ? hi : lo;
  let d = `M0.5 ${y}`;
  for (const [s, e] of work) {
    if (s > 0) d += `H${r1(x(s) - 3)}C${x(s)} ${lo} ${x(s)} ${hi} ${r1(x(s) + 3)} ${hi}`;
    const quietHere = a.quiet && a.quiet[0] === e;
    if (e < WINDOW && !quietHere) {
      d += `H${r1(x(e) - 3)}C${x(e)} ${hi} ${x(e)} ${lo} ${r1(x(e) + 3)} ${lo}`;
      y = lo;
    } else {
      d += `H${x(e)}`;
      y = hi;
    }
  }
  const q = a.quiet ? `M${x(a.quiet[0])} ${hi}H${x(WINDOW)}` : '';
  if (!a.quiet && (!work.length || (work.at(-1)?.[1] ?? 0) < WINDOW)) d += `H${x(WINDOW)}`;
  const drops = a.handed
    .map((h) => `<circle class="drop" cx="${r1(x(h) + 3)}" cy="${lo}" r="2.3" fill="var(--you)"/>`)
    .join('');
  const endY = a.quiet ? hi : y;
  return (
    `<path class="tr" d="${d}" fill="none" stroke="var(--ink-2)" stroke-width="1" stroke-linejoin="round"/>` +
    (q
      ? `<path class="qt" d="${q}" fill="none" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="1.5 3" stroke-linecap="round"/>`
      : '') +
    drops +
    `<circle class="end" cx="${x(WINDOW)}" cy="${endY}" r="2" fill="${a.quiet ? 'var(--warn)' : 'var(--ink-2)'}"/>`
  );
}

export type AgentStateName = 'work' | 'quiet' | 'wait' | 'free';
export type AgentState = { state: AgentStateName; since: number; item: Item | null };

const latest = <T>(xs: readonly T[], at: (x: T) => number): T | undefined =>
  xs.reduce<T | undefined>(
    (best, x) => (best === undefined || at(x) > at(best) ? x : best),
    undefined,
  );

// What the agent is up to: working (it holds a lease, since its claim), quiet (its lease ran out,
// since then), waiting for your answer (its question waits for you, even on an item it holds), or
// free (since its last act).
export function agentState(
  name: string,
  items: readonly Item[],
  feed: readonly FeedEvent[],
  now: number,
  lastSeen?: string,
): AgentState {
  const lastClaim = (id: string) =>
    feed.findLast((e) => e.itemId === id && e.type === 'claimed' && byAgent(e, name));
  const held = items.filter((it) => activeLease(it.lease, now)?.holder === name && !it.asks);
  if (held.length) {
    const claimAt = (it: Item) => Date.parse(lastClaim(it.id)?.at ?? it.updatedAt);
    const it = latest(held, claimAt) ?? null;
    return { state: 'work', since: it ? claimAt(it) : now, item: it };
  }
  const ran = items.filter((it) => it.expiredLease?.holder === name && isStuck(it, now));
  if (ran.length) {
    const at = (it: Item) => Date.parse(it.expiredLease?.expiresAt ?? it.updatedAt);
    const it = latest(ran, at) ?? null;
    return { state: 'quiet', since: it ? at(it) : now, item: it };
  }
  const asks = items.filter((it) => askingAgent(it, feed) === name);
  if (asks.length) {
    const at = (it: Item) => Date.parse(it.asks?.at ?? handedNote(it, feed)?.at ?? it.updatedAt);
    const it = latest(asks, at) ?? null;
    return { state: 'wait', since: it ? at(it) : now, item: it };
  }
  const last = feed.findLast((e) => byAgent(e, name) && !relayed(e));
  const since = last ? Date.parse(last.at) : lastSeen ? Date.parse(lastSeen) : now;
  return {
    state: 'free',
    since,
    item: (last && items.find((it) => it.id === last.itemId)) ?? null,
  };
}

// The agents the column shows: live, or seen in the last two hours, or quiet on an item, by name.
export function agentsShown(
  presence: readonly Agent[] | null | undefined,
  items: readonly Item[],
  feed: readonly FeedEvent[],
  now: number,
): string[] {
  const from = now - WINDOW * MIN;
  const names = new Set<string>();
  for (const a of presence ?? []) if (a.live || Date.parse(a.lastSeen) > from) names.add(a.name);
  for (const e of feed) {
    if (e.actor.kind === 'agent' && !relayed(e) && Date.parse(e.at) > from) names.add(e.actor.name);
  }
  for (const it of items) {
    const holder = activeLease(it.lease, now)?.holder;
    if (holder) names.add(holder);
    if (it.expiredLease && isStuck(it, now)) names.add(it.expiredLease.holder);
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
