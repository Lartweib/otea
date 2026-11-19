import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantiate, requireTemplate } from '../core/board/templates.ts';
import type { Actor } from '../core/item.ts';
import { updateItemState } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem } from './items.ts';
import { claimItem } from './leases.ts';
import { nextFor } from './next.ts';
import { endProcess, renewLeases, waitBeat } from './presence.ts';
import { memoryContext, publishAs } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const claude: Actor = { kind: 'agent', name: 'claude' };
const codex: Actor = { kind: 'agent', name: 'codex' };

const T0 = '2026-01-01T00:00:00.000Z';
const T5 = '2026-01-01T00:05:00.000Z';
const T10 = '2026-01-01T00:10:00.000Z';
const T15 = '2026-01-01T00:15:00.000Z';
const T20 = '2026-01-01T00:20:00.000Z';
const T25 = '2026-01-01T00:25:00.000Z';

const at = (time: string) => () => time;

// P1-R3-6: a subagent's 15-minute lease ran out mid-rebase, as it never sent a heartbeat, and
// another agent took the item over while the first still worked: duplicate evidence, a force push
// and a git puzzle for the person. A lease ran out is no proof its holder stopped: while the
// holder's session runs (an MCP server or wait of it, the test whoami uses), nobody takes it over;
// and any otea call of the holder keeps its leases.
describe('a lease whose holder works on', () => {
  let ctx: Context;
  // claude is heard through a listener that runs (this test's process stands for its wait).
  const listens = (time: string) =>
    waitBeat(ctx.db, { agent: 'claude', channel: 'cli', waiter: process.pid }, at(time)).run();

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'tasks' });
    createItem(
      ctx,
      { collection: 'tasks', title: 'First', fields: { description: 'D' }, actor: ana },
      at(T0),
    );
  });

  afterEach(() => ctx.db.close());

  it('is never taken over once it ran out while the holder session runs, saying why', () => {
    listens(T0);
    claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    listens(T20);

    expect(() => claimItem(ctx, { id: 'TASKS-1', actor: codex }, at(T20))).toThrow(
      "TASKS-1 is still claude's: its lease ran out at 2026-01-01 00:15 UTC, but its session runs (an MCP server or wait of it), so it may be at work on a long step with no otea call. Take other work: otea next. If claude is stuck, the person frees the item on the desk (Liberar).",
    );
    expect(claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T20)).lease?.holder).toBe('claude');
  });

  it('is taken over once that session ended', () => {
    listens(T0);
    claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    endProcess(ctx.db, process.pid);

    expect(claimItem(ctx, { id: 'TASKS-1', actor: codex }, at(T20)).lease?.holder).toBe('codex');
  });

  it('is taken over from a holder heard through no listener, as before', () => {
    claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));

    expect(claimItem(ctx, { id: 'TASKS-1', actor: codex }, at(T20)).lease?.holder).toBe('codex');
  });

  it('is kept by any call of its holder, once half of it is gone', () => {
    claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    renewLeases(ctx.db, 'claude', at(T5));
    expect(getItem(ctx, 'TASKS-1', at(T5)).lease?.expiresAt).toBe(T15);

    renewLeases(ctx.db, 'claude', at(T10));
    expect(getItem(ctx, 'TASKS-1', at(T10)).lease?.expiresAt).toBe(T25);
  });

  it('is not brought back by a call once it ran out: the holder claims it again', () => {
    claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
    renewLeases(ctx.db, 'claude', at(T20));

    expect(getItem(ctx, 'TASKS-1', at(T20)).lease).toBeNull();
  });

  it('is never offered by next to another agent while the holder session runs', () => {
    const board = instantiate(requireTemplate('changes'), 'es', {}, undefined, { keep: true });
    publishAs(ctx, board, 'bcam', at(T0));
    const { id } = createItem(
      ctx,
      {
        collection: board.name,
        title: 'Regar',
        fields: { want: 'x', branch: 'cambio/regar' },
        actor: ana,
      },
      at(T0),
    );
    updateItemState(ctx.db, id, 'doit', T0);
    listens(T0);
    claimItem(ctx, { id, actor: claude }, at(T0));
    listens(T20);

    expect(nextFor(ctx, 'codex', { collection: board.name }, at(T20)).item).toBeNull();
  });
});
