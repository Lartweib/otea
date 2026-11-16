import { describe, expect, it } from 'vitest';
import {
  AGENT_HUES,
  agentHue,
  eventAgent,
  initialsOf,
  knowAgents,
  markOf,
  marksFor,
} from './agent-mark.ts';
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

describe('marksFor: every agent of a project gets a mark of its own', () => {
  it('gives two agents with the same initials different ones', () => {
    const marks = marksFor(['claude-a', 'cli-a']);
    expect(marks.get('claude-a')?.initials).toBe('ca');
    expect(marks.get('cli-a')?.initials).not.toBe('ca');
    expect(marks.get('cli-a')?.initials).toHaveLength(2);
  });

  it('spreads the hues while there are hues left, so no two of the first five share one', () => {
    const names = ['codex-b', 'claude-a', 'gemini-c', 'cli-a', 'claude-h'];
    const marks = marksFor(names);
    expect(new Set(names.map((n) => marks.get(n)?.hue)).size).toBe(AGENT_HUES);
    const pairs = names.map((n) => `${marks.get(n)?.initials}/${marks.get(n)?.hue}`);
    expect(new Set(pairs).size).toBe(names.length);
  });

  it('is the same whatever order the names come in', () => {
    const a = marksFor(['b-x', 'a-x', 'c-x']);
    const b = marksFor(['c-x', 'a-x', 'b-x']);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('marks a name the project does not list by its own initials and hue', () => {
    knowAgents(['claude-a', 'cli-a']);
    expect(markOf('claude-a').initials).toBe('ca');
    expect(markOf('cli-a').initials).not.toBe('ca');
    expect(markOf('zed')).toEqual({ initials: 'ze', hue: agentHue('zed') });
    knowAgents([]);
  });
});
