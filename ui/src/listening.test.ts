import { describe, expect, it } from 'vitest';
import { ago, item as fixture, inMinutes, NOW } from './derive/fixtures.ts';
import {
  anyoneWaits,
  goneHolder,
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

  // P7-R3-10: its lease keeps the item after the session ended, but nobody does it.
  it('marks an item whose holder is no longer connected, though it was seen moments ago', () => {
    const lease = { holder: 'a', expiresAt: inMinutes(10) };
    expect(unheard(item({ lease }), [agent('a', { live: false })], NOW)).toBe(true);
  });

  // P7-R3-1: the only agent set it aside for later; the desk says that instead of an alarm.
  it('leaves alone an item an agent set aside for later', () => {
    const setAside = { by: 'a', at: ago(3) };
    expect(unheard(item({ setAside }), [agent('a')], NOW)).toBe(false);
  });
});

// P7-R3-10: after /exit the item read «claude-haiku lo está haciendo» until its lease ran out.
describe('goneHolder', () => {
  const lease = { holder: 'a', expiresAt: inMinutes(10) };

  it('names the holder of a live lease once it is no longer connected', () => {
    expect(goneHolder(item({ lease }), [agent('a', { live: false })], NOW)?.name).toBe('a');
  });

  it('names none while it is connected, with no live lease, or before presence loads', () => {
    expect(goneHolder(item({ lease }), [agent('a')], NOW)).toBeNull();
    const ran = { holder: 'a', expiresAt: ago(1) };
    expect(goneHolder(item({ lease: ran }), [agent('a', { live: false })], NOW)).toBeNull();
    expect(goneHolder(item({ lease }), undefined, NOW)).toBeNull();
    expect(goneHolder(item({ lease }), [], NOW)).toBeNull();
  });
});

// P7-R2-9, P7-R2-12: a review read «Nadie está escuchando» in red while claude-haiku plainly
// worked, and every queued item did while it worked on another: an agent at work sees what the
// person hands it when it waits again, and what nobody hears waits in its queue.
describe('workingAgents', () => {
  const lease = { holder: 'a', expiresAt: inMinutes(10) };
  const items = [item({ id: 'TASK-2', lease })];

  it('names the agents at work on an item they hold, however long since their last call', () => {
    // Its MCP server beats while it works a long step with no call: the server counts it connected.
    const beating = { holding: ['TASK-2'], listening: true, actedAt: ago(20) };
    expect(workingAgents([agent('a', beating), agent('b')], items, NOW)).toEqual(['a']);
  });

  it('names an agent that called Otea lately though it holds nothing', () => {
    expect(workingAgents([agent('a', { actedAt: ago(1) })], items, NOW)).toEqual(['a']);
    expect(workingAgents([agent('a', { actedAt: ago(10) })], items, NOW)).toEqual([]);
  });

  // P7-R2-9: between two items its wait had just found work, so it was still heard listening, and
  // the desk read it as idle in its chat: red in 8 of 20 samples.
  it('names an agent between two items whose wait just ended, as it calls Otea', () => {
    const between = { listening: true, actedAt: ago(0.5) };
    expect(workingAgents([agent('a', between)], items, NOW)).toEqual(['a']);
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
    const gone = { live: false, holding: ['TASK-2'], actedAt: ago(1) };
    expect(workingAgents([agent('a', gone)], items, NOW)).toEqual([]);
  });
});

describe('hearing', () => {
  it('says nothing while an agent waits, and before presence loads', () => {
    expect(hearing([agent('a', { waiting: true }), agent('b')], [], NOW)).toBeNull();
    expect(hearing(undefined, [], NOW)).toBeNull();
  });

  it('names the agents at work while none waits, else raises the alarm', () => {
    expect(hearing([agent('a', { actedAt: ago(1) })], [], NOW)).toEqual({
      kind: 'working',
      agents: ['a'],
    });
    expect(hearing([agent('a', { actedAt: ago(10) })], [], NOW)).toEqual({ kind: 'unheard' });
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
