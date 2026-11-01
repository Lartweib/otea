import { describe, expect, it } from 'vitest';
import {
  actorLabel,
  ageLabel,
  describeEvent,
  eventActorLabel,
  formatTime,
  leaseLabel,
  momentLabel,
  momentParts,
  relayOf,
  untilLabel,
} from './format.ts';
import type { ItemEvent } from './types.ts';

const event = (type: string, data: Record<string, unknown>): ItemEvent => ({
  id: 1,
  type,
  actor: { kind: 'agent', name: 'claude' },
  at: 't',
  data,
});

describe('format', () => {
  it('labels an actor with its kind and name', () => {
    expect(actorLabel({ kind: 'human', name: 'ana' })).toBe('ana (human)');
  });

  it('labels a decision made in the ui apart from agent work', () => {
    const ui = {
      ...event('transitioned', { channel: 'ui' }),
      actor: { kind: 'human', name: 'human' },
    };

    expect(eventActorLabel(ui as ItemEvent)).toBe('human (ui)');
    expect(eventActorLabel(event('transitioned', { channel: 'cli' }))).toBe('claude (agent)');
    expect(eventActorLabel(event('transitioned', { channel: 'mcp' }))).toBe('claude (agent)');
    expect(eventActorLabel(event('created', { state: 'todo' }))).toBe('claude (agent)');
  });

  it('labels a relayed decision as the human, relayed by the agent, never as the ui', () => {
    const relayed = {
      ...event('transitioned', { channel: 'cli', via: 'claude-a', quote: 'Drop it' }),
      actor: { kind: 'human', name: 'human' },
    } as ItemEvent;

    expect(eventActorLabel(relayed)).toBe('human, relayed by claude-a');
    expect(eventActorLabel({ ...relayed, data: { ...relayed.data, channel: 'ui' } })).toBe(
      'human, relayed by claude-a',
    );
  });

  it('reads the relay of an event: who relayed it and what the human said', () => {
    expect(relayOf(event('transitioned', { via: 'claude-a', quote: 'Drop it' }))).toEqual({
      via: 'claude-a',
      quote: 'Drop it',
    });
    expect(relayOf(event('released', { via: 'claude-a', holder: 'codex' }))).toEqual({
      via: 'claude-a',
      quote: null,
    });
    expect(relayOf(event('transitioned', { channel: 'ui' }))).toBeNull();
    expect(relayOf(event('transitioned', { via: 42 }))).toBeNull();
  });

  it.each([
    [event('created', { state: 'todo' }), 'Created in todo'],
    [event('transitioned', { from: 'todo', to: 'in_progress' }), 'Moved from todo to in_progress'],
    [
      event('transitioned', { from: 'review', to: 'todo', reason: 'Add tests' }),
      'Moved from review to todo: Add tests',
    ],
    [
      event('updated', {
        changes: {
          description: { from: null, to: 'Steps' },
          priority: { from: 'low', to: 'high' },
        },
      }),
      'Updated description (was empty), priority (was low)',
    ],
    [
      event('updated', { changes: { description: { from: 'x'.repeat(50), to: 'y' } } }),
      `Updated description (was ${'x'.repeat(40)}…)`,
    ],
    [event('claimed', { holder: 'claude', expiresAt: 'x' }), 'Claimed by claude'],
    [
      event('claimed', { holder: 'codex', expiresAt: 'x', previous: 'claude' }),
      'Claimed by codex, taking over from claude',
    ],
    [event('released', { holder: 'claude', cause: 'release' }), 'Released by claude'],
    [
      event('released', { holder: 'claude', cause: 'handoff' }),
      'Lease of claude released on handoff',
    ],
    [
      event('evidence_added', { evidenceId: 1, role: 'before', kind: 'image', filename: 'a.png' }),
      'Attached a.png (before)',
    ],
    [
      event('evidence_added', {
        evidenceId: 2,
        role: 'single',
        kind: 'log',
        filename: 'test.log',
        caption: 'All green',
      }),
      'Attached test.log: All green',
    ],
    [
      event('relation_added', { kind: 'parent', from: 'P-2', to: 'E-1', channel: 'cli' }),
      'Linked: P-2 is a child of E-1',
    ],
    [
      event('relation_removed', { kind: 'blocks', from: 'P-2', to: 'P-3', channel: 'ui' }),
      'Unlinked: P-2 blocks P-3',
    ],
    [
      event('relation_added', { kind: 'relates', from: 'B-1', to: 'B-2' }),
      'Linked: B-1 relates to B-2',
    ],
    [event('commented', { text: 'hi' }), 'commented'],
  ])('describes %j', (input, expected) => {
    expect(describeEvent(input)).toBe(expected);
  });

  it('formats a timestamp as date and 24h time in the given zone', () => {
    expect(formatTime('2026-03-04T05:06:07.000Z', 'UTC')).toBe('2026-03-04 05:06');
    expect(formatTime('2026-03-04T23:30:00.000Z', 'America/Argentina/Buenos_Aires')).toBe(
      '2026-03-04 20:30',
    );
  });

  it('labels a lease with its holder and the time it expires in the given zone', () => {
    const lease = { holder: 'claude', expiresAt: '2026-03-04T14:32:00.000Z' };

    expect(leaseLabel(lease, 'UTC')).toBe('held by claude until 14:32');
  });

  it('returns invalid timestamps unchanged', () => {
    expect(formatTime('not a date', 'UTC')).toBe('not a date');
  });
});

describe('ageLabel', () => {
  const now = Date.parse('2026-10-31T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    [20_000, 'now'],
    [12 * 60_000, '12m'],
    [3 * 3_600_000, '3h'],
    [30 * 3_600_000, 'yesterday'],
    [5 * 86_400_000, '5d'],
  ])('says %ims ago as %s', (ms, label) => {
    expect(ageLabel(ago(ms), now)).toBe(label);
  });

  it('says nothing for a date it cannot read', () => {
    expect(ageLabel('nope', now)).toBe('');
  });
});

describe('untilLabel', () => {
  it('says when the hold runs out', () => {
    const lease = { holder: 'claude', expiresAt: '2026-03-04T14:32:00.000Z' };

    expect(untilLabel(lease, 'UTC')).toBe('14:32');
  });
});

describe('momentLabel', () => {
  const now = Date.parse('2026-10-31T18:00:00.000Z');

  it('gives the time alone today, the day and time before, and the year from another year', () => {
    expect(momentLabel('2026-10-31T12:31:00.000Z', now, 'UTC')).toBe('12:31');
    expect(momentLabel('2026-10-28T12:31:00.000Z', now, 'UTC')).toBe('28 Oct, 12:31');
    expect(momentLabel('2025-01-02T09:05:00.000Z', now, 'UTC')).toBe('2 Jan 2025, 09:05');
  });
});

describe('momentParts', () => {
  const now = Date.parse('2026-10-31T18:00:00.000Z');

  it('splits a moment into its day, if not today, and its time, for History to stack them', () => {
    expect(momentParts('2026-10-31T12:31:00.000Z', now, 'UTC')).toEqual({ time: '12:31' });
    expect(momentParts('2026-10-28T12:31:00.000Z', now, 'UTC')).toEqual({
      day: '28 Oct',
      time: '12:31',
    });
    expect(momentParts('2025-01-02T09:05:00.000Z', now, 'UTC')).toEqual({
      day: '2 Jan 2025',
      time: '09:05',
    });
  });
});
