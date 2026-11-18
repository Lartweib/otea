import { describe, expect, it } from 'vitest';
import { ago, item as fixture, inMinutes, NOW } from './derive/fixtures.ts';
import { anyoneWaits, unheard } from './listening.ts';
import type { Agent } from './presence.ts';
import type { Item } from './types.ts';

const agent = (name: string, o: Partial<Agent> = {}): Agent => ({
  name,
  harness: 'Claude Code',
  holding: [],
  lastSeen: ago(0.5),
  live: true,
  waiting: false,
  ...o,
});

const item = (o: Partial<Item> = {}): Item =>
  fixture({ id: 'TASK-1', turn: 'agent', lease: null, ...o });

describe('anyoneWaits', () => {
  it('is true once one agent waits in otea wait', () => {
    expect(anyoneWaits([agent('a'), agent('b', { waiting: true })])).toBe(true);
  });

  it('is false when the agents only have their MCP server open, or none is there', () => {
    expect(anyoneWaits([agent('a', { listening: true })])).toBe(false);
    expect(anyoneWaits([])).toBe(false);
  });

  it('never claims a silence it cannot tell: before presence loads, or from a server that does not say', () => {
    expect(anyoneWaits(undefined)).toBe(true);
    expect(anyoneWaits(null)).toBe(true);
    const { waiting: _, ...older } = agent('a');
    expect(anyoneWaits([older])).toBe(true);
  });
});

describe('unheard', () => {
  it('marks an item on the agent turn that nobody holds while no agent waits', () => {
    expect(unheard(item(), [agent('a')], NOW)).toBe(true);
    expect(unheard(item(), [agent('a', { waiting: true })], NOW)).toBe(false);
  });

  it('leaves alone what is yours or closed', () => {
    expect(unheard(item({ turn: 'human' }), [], NOW)).toBe(false);
    expect(unheard(item({ turn: 'none' }), [], NOW)).toBe(false);
  });

  it('leaves alone an item its holder works on now, and marks one whose holder went idle', () => {
    const lease = { holder: 'a', expiresAt: inMinutes(10) };
    expect(unheard(item({ lease }), [agent('a')], NOW)).toBe(false);
    expect(unheard(item({ lease }), [agent('a', { lastSeen: ago(10) })], NOW)).toBe(true);
  });
});
