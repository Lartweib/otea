import { describe, expect, it } from 'vitest';
import { ago, item as fixture, inMinutes, NOW } from './derive/fixtures.ts';
import {
  anyoneWaits,
  busyAgents,
  handsToAgent,
  hearing,
  unheard,
  workingAgents,
} from './listening.ts';
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

  // P7-R3-1: the only agent set it aside for later; the desk says that instead of an alarm.
  it('leaves alone an item an agent set aside for later', () => {
    const setAside = { by: 'a', at: ago(3) };
    expect(unheard(item({ setAside }), [agent('a')], NOW)).toBe(false);
  });
});

// P7-R2-12: every queued item read «nadie está escuchando» in red while the only agent worked on
// another item; that is a queue, not an alarm.
describe('busyAgents', () => {
  const lease = { holder: 'a', expiresAt: inMinutes(10) };
  const items = [item({ id: 'TASK-2', lease })];

  it('names the agents at work on an item they hold', () => {
    expect(busyAgents([agent('a', { holding: ['TASK-2'] }), agent('b')], items, NOW)).toEqual([
      'a',
    ]);
  });

  it('names none gone idle on what it holds, nor one only waiting for your answer', () => {
    expect(
      busyAgents([agent('a', { holding: ['TASK-2'], lastSeen: ago(10) })], items, NOW),
    ).toEqual([]);
    const asks = { question: 1, by: 'a', text: 'Which one?', at: ago(1) };
    const asking = [item({ id: 'TASK-2', lease, asks })];
    expect(busyAgents([agent('a', { holding: ['TASK-2'] })], asking, NOW)).toEqual([]);
  });
});

// P7-R2-9: a review read «Nadie está escuchando» in red while claude-haiku plainly worked: an agent
// at work sees what the person hands it when it waits again.
describe('workingAgents', () => {
  const lease = { holder: 'a', expiresAt: inMinutes(10) };
  const items = [item({ id: 'TASK-2', lease })];

  it('names an agent that holds an item it works on, however long since its last call', () => {
    expect(
      workingAgents([agent('a', { holding: ['TASK-2'], lastSeen: ago(20) })], items, NOW),
    ).toEqual(['a']);
  });

  it('names a command-line agent that called lately though it holds nothing', () => {
    expect(workingAgents([agent('a', { lastSeen: ago(1) })], items, NOW)).toEqual(['a']);
    expect(workingAgents([agent('a', { lastSeen: ago(10) })], items, NOW)).toEqual([]);
  });

  // An open MCP server is heard on its beats, so a fresh sighting is no call: idle in its chat, it
  // hears nothing of the desk.
  it('names no agent only heard through its open MCP server, holding nothing', () => {
    expect(
      workingAgents([agent('a', { listening: true, lastSeen: ago(0.5) })], items, NOW),
    ).toEqual([]);
  });

  it('names none that only waits for your answer, nor one gone', () => {
    const asks = { question: 1, by: 'a', text: 'Which one?', at: ago(1) };
    const asking = [item({ id: 'TASK-2', lease, asks })];
    expect(workingAgents([agent('a', { holding: ['TASK-2'] })], asking, NOW)).toEqual([]);
    expect(workingAgents([agent('a', { live: false, lastSeen: ago(1) })], items, NOW)).toEqual([]);
  });
});

describe('hearing', () => {
  it('says nothing while an agent waits, and before presence loads', () => {
    expect(hearing([agent('a', { waiting: true }), agent('b')], [], NOW)).toBeNull();
    expect(hearing(undefined, [], NOW)).toBeNull();
  });

  it('names the agents at work while none waits, else raises the alarm', () => {
    expect(hearing([agent('a', { lastSeen: ago(1) })], [], NOW)).toEqual({
      kind: 'working',
      agents: ['a'],
    });
    expect(hearing([agent('a', { lastSeen: ago(10) })], [], NOW)).toEqual({ kind: 'unheard' });
    expect(hearing([], [], NOW)).toEqual({ kind: 'unheard' });
  });
});

// P4-R3-5: on the person's own chore, red «Nadie está escuchando… otea wait» showed though what
// they do there closes the item or keeps it theirs: no agent needs to listen.
describe('handsToAgent', () => {
  const choice = (turn: string) => ({ move: { turn } });

  it('says so only when one of the moves offered lands on an agent', () => {
    expect(handsToAgent([choice('none'), choice('human')])).toBe(false);
    expect(handsToAgent([null, choice('none'), choice('agent')])).toBe(true);
    expect(handsToAgent([])).toBe(false);
  });
});
