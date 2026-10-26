import { describe, expect, it } from 'vitest';
import { actorLabel, describeEvent, eventActorLabel, formatTime } from './format.ts';
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
    expect(eventActorLabel(event('created', { state: 'todo' }))).toBe('claude (agent)');
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

  it('returns invalid timestamps unchanged', () => {
    expect(formatTime('not a date', 'UTC')).toBe('not a date');
  });
});
