import { describe, expect, it } from 'vitest';
import { AGENT_HUES, agentHue, eventAgent, initialsOf } from './agent-mark.ts';
import type { ItemEvent } from './types.ts';

describe('initialsOf', () => {
  it.each([
    ['claude-b', 'cb'],
    ['claude_code', 'cc'],
    ['Codex', 'co'],
    ['gpt 5 mini', 'g5'],
    ['codex-cloud-west', 'cc'],
  ])('%s is %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('agentHue', () => {
  const names = ['claude', 'claude-b', 'codex', 'gemini', 'cursor', 'aider', 'copilot', 'devin'];

  it('gives a name the same hue every time, one of a small set', () => {
    for (const name of names) {
      expect(agentHue(name)).toBe(agentHue(name));
      expect(agentHue(name)).toBeGreaterThanOrEqual(0);
      expect(agentHue(name)).toBeLessThan(AGENT_HUES);
    }
  });

  it('spreads names over the hues', () => {
    expect(new Set(names.map(agentHue)).size).toBeGreaterThanOrEqual(4);
    expect(agentHue('claude')).not.toBe(agentHue('claude-b'));
  });
});

describe('eventAgent', () => {
  const event = (actor: ItemEvent['actor'], data: Record<string, unknown> = {}): ItemEvent => ({
    id: 1,
    type: 'transitioned',
    actor,
    at: '2026-11-01T10:00:00Z',
    data,
  });

  it('is the agent that acted, or the one that relayed your words, never you', () => {
    expect(eventAgent(event({ kind: 'agent', name: 'claude-b' }))).toBe('claude-b');
    expect(eventAgent(event({ kind: 'human', name: 'human' }, { via: 'codex' }))).toBe('codex');
    expect(eventAgent(event({ kind: 'human', name: 'human' }, { channel: 'ui' }))).toBeNull();
  });
});
