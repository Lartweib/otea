import { describe, expect, it } from 'vitest';
import type { FeedEvent } from '../activity.ts';
import { agent, ago, item, moved, you } from './fixtures.ts';
import { agentOf } from './toca.ts';

// A stuck item the person restarted is in the queue of its step for any agent; one they
// reassigned waits for the agent they chose, until some agent claims it or it moves on.

let seq = 1000;
const lease = (
  itemId: string,
  type: 'claimed' | 'released',
  actor: FeedEvent['actor'],
  data: Record<string, unknown>,
  minutes: number,
): FeedEvent => ({ id: ++seq, itemId, type, actor, at: ago(minutes), data });

describe('who an item waits for after Atasco', () => {
  const waiting = item({ id: 'A', turn: 'agent', state: 'fixing' });
  const before = [
    moved('A', 'fixing', agent('kiln'), { minutes: 60 }),
    lease('A', 'claimed', agent('kiln'), { holder: 'kiln' }, 59),
  ];

  it('waits for the agent you left it for', () => {
    const feed = [
      ...before,
      lease('A', 'released', you, { holder: 'kiln', cause: 'reassign', next: 'quill' }, 2),
    ];
    expect(agentOf(waiting, feed)).toBe('quill');
  });

  it('waits for any agent once you put it back in the queue', () => {
    const feed = [...before, lease('A', 'released', you, { holder: 'kiln', cause: 'restart' }, 2)];
    expect(agentOf(waiting, feed)).toBeNull();
  });

  it('forgets the choice once an agent claims it or it moves', () => {
    const left = lease(
      'A',
      'released',
      you,
      { holder: 'kiln', cause: 'reassign', next: 'quill' },
      3,
    );
    const claimed = [
      ...before,
      left,
      lease('A', 'claimed', agent('scout'), { holder: 'scout' }, 1),
    ];
    expect(agentOf(waiting, claimed)).toBe('scout');
    const movedOn = [...before, left, moved('A', 'verify', agent('mender'), { minutes: 1 })];
    expect(agentOf(waiting, movedOn)).toBe('mender');
  });

  it('keeps naming the holder of a live lease, and the one whose lease ran out', () => {
    const feed = [
      ...before,
      lease('A', 'released', you, { holder: 'kiln', cause: 'reassign', next: 'quill' }, 2),
    ];
    const held = item({ id: 'A', turn: 'agent', lease: { holder: 'mender', expiresAt: ago(-5) } });
    expect(agentOf(held, feed)).toBe('mender');
  });
});
