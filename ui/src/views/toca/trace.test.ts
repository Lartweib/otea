import { describe, expect, it } from 'vitest';
import type { FeedEvent } from '../../activity.ts';
import { agent, ago, inMinutes, item, MIN, moved, NOW, you } from '../../derive/fixtures.ts';
import type { Turn } from '../../types.ts';
import { agentState, agentsShown, agentTrace, tracePath } from './trace.ts';

// An agent's last two hours, from the feed: high while it holds a lease, low otherwise, a drop at
// each handoff to you, a dotted tail while it is quiet.

let seq = 1000;
const ev = (
  itemId: string,
  type: string,
  who: FeedEvent['actor'],
  minutes: number,
  data: Record<string, unknown> = {},
): FeedEvent => ({ id: ++seq, itemId, type, actor: who, at: ago(minutes), data });

const claimed = (id: string, name: string, minutes: number, ttl = 60) =>
  ev(id, 'claimed', agent(name), minutes, {
    holder: name,
    expiresAt: new Date(NOW - minutes * MIN + ttl * MIN).toISOString(),
  });
const released = (id: string, name: string, minutes: number, cause = 'handoff') =>
  ev(id, 'released', agent(name), minutes, { holder: name, cause });

const turnOf = (_: string, state: string): Turn | undefined =>
  state === 'verify' || state === 'reported' ? 'human' : state === 'fixed' ? 'none' : 'agent';

describe('agentTrace', () => {
  it('reads the work from claims to releases, minutes over the last 120', () => {
    const feed = [
      claimed('A', 'mender', 110),
      moved('A', 'verify', agent('mender'), { minutes: 80 }),
      released('A', 'mender', 80),
      claimed('B', 'mender', 50),
    ];
    const tr = agentTrace(feed, 'mender', NOW, {
      leases: [{ item: 'B', expiresAt: inMinutes(10), active: true }],
      turnOf,
    });
    expect(tr).toEqual({
      work: [
        [10, 40],
        [70, 120],
      ],
      handed: [40],
    });
  });

  it('starts a lease older than the window at its start, and merges overlapping ones', () => {
    const feed = [claimed('A', 'kiln', 200, 300), claimed('B', 'kiln', 30)];
    const tr = agentTrace(feed, 'kiln', NOW, {
      leases: [
        { item: 'A', expiresAt: inMinutes(100), active: true },
        { item: 'B', expiresAt: inMinutes(30), active: true },
      ],
      turnOf,
    });
    expect(tr.work).toEqual([[0, 120]]);
  });

  it('ends the work where a lease ran out and draws the quiet tail to now', () => {
    const feed = [claimed('A', 'kiln', 72, 60)];
    const tr = agentTrace(feed, 'kiln', NOW, {
      leases: [{ item: 'A', expiresAt: ago(12), active: false }],
      turnOf,
    });
    expect(tr).toEqual({ work: [[48, 108]], handed: [], quiet: [108, 120] });
  });

  it('counts only its own handoffs to you, never a relayed move or another agent’s', () => {
    const feed = [
      moved('A', 'verify', agent('mender'), { minutes: 30 }),
      moved('A', 'reported', agent('mender'), { minutes: 20, via: 'mender' }),
      moved('A', 'verify', agent('kiln'), { minutes: 10 }),
      moved('A', 'fixing', agent('mender'), { minutes: 5 }),
      moved('A', 'verify', you, { minutes: 4 }),
    ];
    expect(agentTrace(feed, 'mender', NOW, { leases: [], turnOf }).handed).toEqual([90]);
  });
});

describe('tracePath', () => {
  it('draws steps of 3 px, drops at handoffs, the dotted tail and the end dot, as the mock', () => {
    expect(
      tracePath(
        {
          work: [
            [10, 58],
            [89, 108],
          ],
          quiet: [108, 120],
          handed: [58],
        },
        260,
      ),
    ).toBe(
      '<path class="tr" d="M0.5 17.5H18.7C21.7 17.5 21.7 5.5 24.7 5.5H120.3C123.3 5.5 123.3 17.5 126.3 17.5H185.9C188.9 17.5 188.9 5.5 191.9 5.5H229.1" fill="none" stroke="var(--ink-2)" stroke-width="1" stroke-linejoin="round"/><path class="qt" d="M229.1 5.5H254.5" fill="none" stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="1.5 3" stroke-linecap="round"/><circle class="drop" cx="126.3" cy="17.5" r="2.3" fill="var(--you)"/><circle class="end" cx="254.5" cy="5.5" r="2" fill="var(--warn)"/>',
    );
    expect(
      tracePath(
        {
          work: [
            [0, 21],
            [30, 64],
          ],
          handed: [21],
        },
        260,
      ),
    ).toBe(
      '<path class="tr" d="M0.5 5.5H41.9C44.9 5.5 44.9 17.5 47.9 17.5H61C64 17.5 64 5.5 67 5.5H133C136 5.5 136 17.5 139 17.5H254.5" fill="none" stroke="var(--ink-2)" stroke-width="1" stroke-linejoin="round"/><circle class="drop" cx="47.9" cy="17.5" r="2.3" fill="var(--you)"/><circle class="end" cx="254.5" cy="17.5" r="2" fill="var(--ink-2)"/>',
    );
    expect(tracePath({ work: [], handed: [] }, 260)).toBe(
      '<path class="tr" d="M0.5 17.5H254.5" fill="none" stroke="var(--ink-2)" stroke-width="1" stroke-linejoin="round"/><circle class="end" cx="254.5" cy="17.5" r="2" fill="var(--ink-2)"/>',
    );
  });
});

describe('agentState', () => {
  const lease = { holder: 'mender', expiresAt: inMinutes(30) };
  it('works while it holds a lease, since its claim', () => {
    const it0 = item({ id: 'A', turn: 'agent', state: 'fixing', lease });
    const st = agentState('mender', [it0], [claimed('A', 'mender', 6)], NOW);
    expect(st).toMatchObject({ state: 'work', since: NOW - 6 * MIN, item: it0 });
  });

  it('is quiet when its lease ran out with nobody taking the item', () => {
    const it0 = item({
      id: 'A',
      turn: 'agent',
      state: 'fixing',
      expiredLease: { holder: 'kiln', expiresAt: ago(12) },
    });
    expect(agentState('kiln', [it0], [], NOW)).toMatchObject({
      state: 'quiet',
      since: NOW - 12 * MIN,
    });
  });

  it('waits for your answer while its question (otea ask) waits, on an item it still holds', () => {
    const it0 = item({
      id: 'A',
      state: 'sconcept',
      lease: { holder: 'kiln', expiresAt: inMinutes(10) },
      asks: { question: 1, by: 'kiln', text: '¿Liso?', at: ago(6) },
    });
    expect(agentState('kiln', [it0], [], NOW)).toMatchObject({
      state: 'wait',
      item: it0,
      since: NOW - 6 * MIN,
    });
  });

  it('waits for your answer when its last handoff asks you something', () => {
    const it0 = item({ id: 'A', state: 'reported' });
    const feed = [moved('A', 'reported', agent('scout'), { minutes: 14, reason: '¿La 0.9?' })];
    expect(agentState('scout', [it0], feed, NOW)).toMatchObject({ state: 'wait', item: it0 });
  });

  it('is free since its last act otherwise', () => {
    const it0 = item({ id: 'A', state: 'verify' });
    const feed = [moved('A', 'verify', agent('quill'), { minutes: 40, reason: 'Listo.' })];
    expect(agentState('quill', [it0], feed, NOW)).toMatchObject({
      state: 'free',
      since: NOW - 40 * MIN,
      item: it0,
    });
  });
});

describe('agentsShown', () => {
  it('shows every agent live or seen in the last two hours, and the quiet ones, by name', () => {
    const presence = [
      { name: 'Scout', harness: null, holding: [], lastSeen: ago(1), live: true },
      { name: 'old', harness: null, holding: [], lastSeen: ago(300), live: false },
    ];
    const items = [
      item({
        id: 'A',
        turn: 'agent',
        state: 'fixing',
        expiredLease: { holder: 'Kiln', expiresAt: ago(200) },
      }),
    ];
    const feed = [moved('B', 'verify', agent('mender'), { minutes: 90 })];
    expect(agentsShown(presence, items, feed, NOW)).toEqual(['Kiln', 'mender', 'Scout']);
  });
});
