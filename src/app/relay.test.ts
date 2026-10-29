import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem } from './items.ts';
import { claimItem } from './leases.ts';
import { type RelayInput, relayDecision } from './relay.ts';
import { memoryContext } from './testing.ts';

const claude: Actor = { kind: 'agent', name: 'claude' };
const codex: Actor = { kind: 'agent', name: 'codex' };
const human: Actor = { kind: 'human', name: 'human' };

const T0 = '2026-01-01T00:00:00.000Z';
const T5 = '2026-01-01T00:05:00.000Z';

const at = (time: string) => () => time;

describe('relayDecision', () => {
  let ctx: Context;

  const item = () => getItem(ctx, 'TASKS-1', at(T5));
  const relay = (input: Partial<RelayInput> = {}) =>
    relayDecision(
      ctx,
      {
        id: 'TASKS-1',
        to: 'discarded',
        via: 'claude',
        quote: 'Drop it, we no longer need it',
        reason: 'No longer needed',
        ...input,
      },
      at(T5),
    );
  const move = (to: string, actor = claude) =>
    moveItem(ctx, { id: 'TASKS-1', to, actor, channel: 'cli' }, at(T0));

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'tasks' });
    const fields = { description: 'Details' };
    createItem(ctx, { collection: 'tasks', title: 'First', fields, actor: claude }, at(T0));
    move('in_progress');
    move('review');
  });

  afterEach(() => ctx.db.close());

  it('moves the item as the human, recording the relaying agent, the source and the quote', () => {
    const moved = relay();

    expect(moved).toMatchObject({ state: 'discarded', turn: 'none', updatedAt: T5 });
    expect(item().events.at(-1)).toMatchObject({
      type: 'transitioned',
      actor: human,
      at: T5,
      data: {
        from: 'review',
        to: 'discarded',
        reason: 'No longer needed',
        channel: 'cli',
        via: 'claude',
        source: 'conversation',
        quote: 'Drop it, we no longer need it',
      },
    });
  });

  it('trims the quote it records', () => {
    relay({ quote: '  yes, discard it \n' });

    expect(item().events.at(-1)?.data.quote).toBe('yes, discard it');
  });

  it.each(['', '   '])('requires a quote (%j) with quote_required, writing nothing', (quote) => {
    expect(() => relay({ quote })).toThrow(expect.objectContaining({ code: 'quote_required' }));
    expect(item()).toMatchObject({ state: 'review', updatedAt: T0 });
  });

  it('requires a reason when the transition does; the quote does not stand in for it', () => {
    expect(() => relay({ reason: '' })).toThrow(
      expect.objectContaining({ code: 'reason_required' }),
    );
    expect(item().state).toBe('review');
  });

  it('refuses a human-ui transition with forbidden, writing nothing', () => {
    expect(() => relay({ to: 'done' })).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(item().events).toHaveLength(3);
  });

  it('refuses an agent transition with not_relayable', () => {
    ctx.db.exec("UPDATE items SET state = 'todo'");

    expect(() => relay({ to: 'in_progress' })).toThrow(
      expect.objectContaining({ code: 'not_relayable' }),
    );
  });

  it('rejects an undeclared transition and an unknown item', () => {
    expect(() => relay({ to: 'in_progress' })).toThrow(
      expect.objectContaining({ code: 'invalid_transition' }),
    );
    expect(() => relay({ id: 'TASKS-9' })).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('relays from incomplete on the human transition, not the agent one', () => {
    createItem(ctx, { collection: 'tasks', title: 'Vague', actor: claude }, at(T0));
    ctx.db.exec(`UPDATE items SET state = 'incomplete' WHERE id = 'TASKS-2'`);

    relay({ id: 'TASKS-2' });

    expect(getItem(ctx, 'TASKS-2', at(T5)).events.at(-1)?.actor).toEqual(human);
  });

  describe('on an item another agent holds', () => {
    beforeEach(() => {
      createItem(
        ctx,
        { collection: 'tasks', title: 'Held', fields: { description: 'D' }, actor: claude },
        at(T0),
      );
      claimItem(ctx, { id: 'TASKS-2', actor: codex }, at(T0));
    });

    it('is not blocked, like the human in the ui, and releases the lease on handoff', () => {
      const moved = relay({ id: 'TASKS-2' });

      expect(moved).toMatchObject({ state: 'discarded', lease: null });
      expect(getItem(ctx, 'TASKS-2', at(T5)).events.slice(-2)).toMatchObject([
        { type: 'transitioned', actor: human, data: { via: 'claude', source: 'conversation' } },
        {
          type: 'released',
          actor: human,
          data: { holder: 'codex', cause: 'handoff', via: 'claude' },
        },
      ]);
    });
  });
});
