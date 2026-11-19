import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { claimItem, releaseItem } from './leases.ts';
import { listAgents, seeAgent, waitBeat } from './presence.ts';
import { memoryContext } from './testing.ts';

const T = (seconds: number) => new Date(Date.UTC(2026, 10, 19, 17, 0, seconds)).toISOString();
const at = (time: string) => () => time;
const LEAD = 'claude-haiku';
const SUB = 'claude-haiku-hacer';
const sub: Actor = { kind: 'agent', name: SUB };
const lead: Actor = { kind: 'agent', name: LEAD };

// P1-R3-8: finished subagents stayed «conectado · ahora mismo» while their parent session lived:
// each left its otea wait running in the parent's shells, and the wait's beats kept it heard. A
// subagent (<its parent's name>-<role>) that released what it held and made no call since, for a
// short while, has finished: it shows so, whatever wait of it still beats.
describe('a subagent that released what it held', () => {
  let ctx: Context;
  // A command it runs, and a beat of a wait of it (this test's process stands for that wait).
  const call = (agent: string, time: string) =>
    seeAgent(ctx.db, { agent, channel: 'cli', call: true }, at(time));
  const beat = (agent: string, time: string) =>
    waitBeat(ctx.db, { agent, channel: 'cli', waiter: process.pid }, at(time)).run();
  const shown = (agent: string, time: string) =>
    listAgents(ctx.db, at(time)).find(({ name }) => name === agent);

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'tasks' });
    createItem(
      ctx,
      { collection: 'tasks', title: 'First', fields: { description: 'D' }, actor: lead },
      at(T(0)),
    );
    for (const agent of [LEAD, SUB]) {
      call(agent, T(0));
      beat(agent, T(0));
    }
    claimItem(ctx, { id: 'TASKS-1', actor: sub }, at(T(10)));
    call(SUB, T(60));
    releaseItem(ctx, { id: 'TASKS-1', actor: sub }, at(T(60)));
  });

  afterEach(() => ctx.db.close());

  it('shows as finished once it made no call for a short while, though its wait still beats', () => {
    for (const agent of [LEAD, SUB]) beat(agent, T(180));

    expect(shown(SUB, T(180))).toMatchObject({ live: false, listening: false, waiting: false });
    expect(shown(LEAD, T(180))).toMatchObject({ live: true, waiting: true });
  });

  it('stays connected for a short while after its release', () => {
    beat(SUB, T(100));
    expect(shown(SUB, T(100))?.live).toBe(true);
  });

  it('stays connected once it calls again after its release', () => {
    call(SUB, T(150));
    beat(SUB, T(180));
    expect(shown(SUB, T(180))?.live).toBe(true);
  });

  it('never counts a session of its own as a subagent: claude-2 is a second session of claude', () => {
    for (const agent of ['claude', 'claude-2']) {
      call(agent, T(0));
      beat(agent, T(0));
    }
    createItem(
      ctx,
      { collection: 'tasks', title: 'Second', fields: { description: 'D' }, actor: lead },
      at(T(0)),
    );
    const second: Actor = { kind: 'agent', name: 'claude-2' };
    claimItem(ctx, { id: 'TASKS-2', actor: second }, at(T(10)));
    call('claude-2', T(60));
    releaseItem(ctx, { id: 'TASKS-2', actor: second }, at(T(60)));
    beat('claude-2', T(180));

    expect(shown('claude-2', T(180))?.live).toBe(true);
  });

  it('never applies to the lead, whose wait keeps it listening after a release', () => {
    claimItem(ctx, { id: 'TASKS-1', actor: lead }, at(T(70)));
    call(LEAD, T(80));
    releaseItem(ctx, { id: 'TASKS-1', actor: lead, later: true }, at(T(80)));
    beat(LEAD, T(240));

    expect(shown(LEAD, T(240))).toMatchObject({ live: true, waiting: true });
  });
});
