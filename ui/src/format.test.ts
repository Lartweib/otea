import { describe, expect, it } from 'vitest';
import {
  actorLabel,
  describeEvent,
  eventActorLabel,
  formatTime,
  leaseLabel,
  relayOf,
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
